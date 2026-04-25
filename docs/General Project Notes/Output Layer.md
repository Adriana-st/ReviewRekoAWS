# ReviewReko — PROJECT NOTES

---

## WHAT'S DONE — Input Layer

### 1. Frontend (index.html)

A single HTML page with three sections:
- Submit Review form (name, product, category, rating, text, image upload)
- Browse Reviews gallery (shows approved reviews, filterable by category)
- Admin table (shows all records including rejected ones with reasons)

Deployed on AWS Amplify:
- Production branch (main): https://main.d1wca7itzjfmad.amplifyapp.com
- Dev branch (with reviewId changes): https://dev.d1wca7itzjfmad.amplifyapp.com

**Changes made to frontend (dev branch):**
- `crypto.randomUUID()` generates a `reviewId` once per submission
- `reviewId` passed as `x-review-id` header to `POST /upload-url`
- `reviewId` passed in POST body to `POST /reviews`

### 2. Lambda — GeneratePresignedURL_ReviewReko

Receives the image from the frontend via API Gateway and uploads it directly to S3. Returns the S3 image key to the frontend.

Environment variables:
- `UPLOAD_BUCKET` = `review-images-uploads-reviewreko`

**Change made:** reads `x-review-id` header from the request and uses it as the S3 image filename: `uploads/{reviewId}.{ext}`. Falls back to `uuid.uuid4()` if header is missing.

### 3. API Gateway — Gateway_ReviewReko

- `POST /upload-url` → triggers GeneratePresignedURL Lambda ✅
- `POST /reviews` → triggers SaveReview_ReviewReko Lambda ✅
- `/reviews` resource → GET method still needed (Output Layer)

Base URL: https://ptyne4n0cl.execute-api.eu-west-1.amazonaws.com/prod

**Change made:** CORS on `/upload-url` updated to allow `x-review-id` custom header.

### 4. S3 Uploads Bucket — review-images-uploads-reviewreko

- Private (block all public access is ON)
- CORS policy configured
- S3 Event Notification configured — see Processing Layer

---

## WHAT'S DONE — Processing Layer

### 1. S3 Approved Bucket — approved-images-reviewreko

- Block all public access is OFF
- Bucket policy allows `s3:GetObject` for all objects (public read)
- No CORS needed on this bucket
- Lambda copies approved images here after Rekognition clears them
- The public URL gets stored in DynamoDB and the frontend loads it as `<img src="...">`

### 2. DynamoDB Table — review-decisions-reviewreko

- Partition key: `reviewId` (String) — **no sort key**
- Capacity mode: On-demand
- `timestamp` stored as a regular attribute, not a key

GSI:
- Index name: `category-index`
- Partition key: `productCategory` (String)
- Sort key: `timestamp` (String)
- Projected attributes: All

This GSI is what lets the frontend filter reviews by category. Without it, every filter request scans the whole table.

> **Note for output layer:** the main table has no sort key — queries are by `reviewId` only. All filtering and sorting by time goes through the `category-index` GSI.

Fields stored in each record:

| Field | Source |
|---|---|
| `reviewId` | Frontend (generated once per submission) |
| `timestamp` | Lambda |
| `customerName` | Frontend POST |
| `productName` | Frontend POST |
| `productCategory` | Frontend POST |
| `reviewText` | Frontend POST |
| `starRating` | Frontend POST |
| `imageKey` | ReviewProcessor (approved S3 URL) |
| `status` | ReviewProcessor (APPROVED / REJECTED / PENDING) |
| `reason` | ReviewProcessor |
| `labelsDetected` | ReviewProcessor |
| `moderationFlags` | ReviewProcessor |
| `aiDescription` | ReviewProcessor |

### 3. Lambda — ReviewProcessor_ReviewReko

- Runtime: Python 3.12
- Timeout: 30s (Rekognition calls take time — default 3s would silently fail)
- Memory: 256MB

Environment variables:
- `UPLOAD_BUCKET` = `review-images-uploads-reviewreko`
- `APPROVED_BUCKET` = `approved-images-reviewreko`
- `DYNAMODB_TABLE` = `review-decisions-reviewreko`
- `MODERATION_THRESHOLD` = `80`

IAM inline policy `ReviewProcessor-Policy`:
- `s3:GetObject`, `s3:PutObject` on both S3 buckets
- `rekognition:DetectModerationLabels`, `rekognition:DetectLabels`
- `dynamodb:PutItem`, `dynamodb:UpdateItem` on the table
- `cloudwatch:PutMetricData`

What the function does in order:
1. Triggered by S3 event on `uploads/` prefix
2. Extracts `reviewId` from image key — e.g. `uploads/abc-123.jpg` → `abc-123`
3. Calls Rekognition `DetectModerationLabels` — if anything flagged above 80% confidence: writes REJECTED record to DynamoDB with reason + flags, then stops
4. Calls Rekognition `DetectLabels` — also checks for "Blurry" label and rejects those too
5. Copies image from uploads bucket to approved bucket
6. Generates plain-English description from detected labels (Bedrock not available on student account — description built from labels in Python)
7. Uses `update_item` by `reviewId` alone to update the existing DynamoDB record with: status, reason, imageKey (approved URL), labelsDetected, moderationFlags, aiDescription, timestamp
8. Pushes custom metric to CloudWatch — dimensions: Status (APPROVED/REJECTED), Category

### 4. S3 Event Notification — review-images-uploads-reviewreko

- Name: `TriggerReviewProcessor`
- Prefix: `uploads/`
- Event type: `s3:ObjectCreated:Put`
- Destination: `ReviewProcessor_ReviewReko` Lambda

> **Important:** the prefix `uploads/` is critical — without it, every time Lambda copies an image to the approved bucket it would trigger itself again in an infinite loop.

### 5. Lambda — SaveReview_ReviewReko

- Runtime: Python 3.12
- Timeout: 10s
- Memory: 128MB

Environment variables:
- `DYNAMODB_TABLE` = `review-decisions-reviewreko`

IAM inline policy `SaveReview-Policy`:
- `dynamodb:PutItem`, `dynamodb:UpdateItem` on the table

What the function does:
- Triggered by `POST /reviews` via API Gateway
- Receives review form data from frontend: `reviewId`, `customerName`, `productName`, `productCategory`, `starRating`, `reviewText`, `imageKey`
- Writes full record to DynamoDB with `status: PENDING`
- ReviewProcessor updates the same record later with AI results using the shared `reviewId`

### 6. CloudWatch Dashboard — ReviewReko-Dashboard

- Custom namespace: `ReviewSystem`
- Metric: `ProcessedImages`
- Dimensions: Status (APPROVED/REJECTED), Category
- Line graph showing approvals vs rejections over time

---

## WHAT TO DO NEXT — Output Layer

This is what serves the approved reviews back to the gallery.

### STEP 1 — Create ReviewAnalytics_ReviewReko Lambda

Queries DynamoDB and returns reviews as JSON to the frontend.

Three scenarios it needs to handle:
- `GET /reviews` → return all APPROVED records (scan table, filter by status = APPROVED)
- `GET /reviews?category=footwear` → query `category-index` GSI by `productCategory` = footwear, filter status = APPROVED
- `GET /reviews?admin=true` → return ALL records including rejected

The `imageKey` field in each approved record is the full S3 public URL. The frontend puts it straight into an `<img>` tag — no extra work needed.

IAM role needs: `dynamodb:Query`, `dynamodb:Scan` on `review-decisions-reviewreko` table only.

### STEP 2 — Add GET /reviews to API Gateway

Go to `Gateway_ReviewReko` → `/reviews` resource (already exists) → Actions → Create Method → GET → Lambda Proxy Integration → `ReviewAnalytics_ReviewReko` → Enable CORS → Deploy API to prod stage.

---

## THINGS EVERYONE SHOULD KNOW

- Every time you change anything in API Gateway you **MUST redeploy** (Actions → Deploy API → prod). Changes don't go live automatically.
- Every Lambda response must include these headers or the frontend breaks:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Headers: *`
- The S3 event notification prefix MUST be set to `uploads/` — without this, every time Lambda copies an image to the approved bucket it will trigger itself again in an infinite loop.
- The DynamoDB table has **no sort key** — do not add one. The GSI handles time-based sorting.

---

## DEMO VIDEO PLAN (10 min max, all three of us must speak)

**Scenario 1 — Normal approval**
Submit a review with a clean product photo. Show it appearing in the gallery with labels and AI description.

**Scenario 2 — Content rejection**
Submit with an inappropriate image. Show the REJECTED entry in the admin dashboard with the flag + confidence %.

**Scenario 3 — Blurry rejection**
Submit a very blurry out-of-focus photo. Show it rejected with reason: `blurry_image`.

**Scenario 4 — Category filtering**
Show the gallery filtering by different categories using the GSI.

**Scenario 5 — CloudWatch dashboard**
Show the approvals vs rejections graph with real data.

---

## SUBMISSION CHECKLIST (due Sunday 26 April 23:59)

- [ ] Video demonstration (max 10 min)
- [ ] One-page contribution summary (who built what — be specific)
- [ ] Architecture diagram
- [ ] AWS Cost Estimator breakdown (annual cost per service)
- [ ] Screenshots: Lambda configs, IAM roles, DynamoDB + GSI, S3 event notification, API Gateway, CloudWatch dashboard
- [ ] Report: architecture + business case, security justification, monitoring section, design decisions
