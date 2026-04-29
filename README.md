# ReviewReko

**[Try out the platform](https://main.d1wca7itzjfmad.amplifyapp.com/)!**

A serverless product review platform with AI-powered image moderation built on AWS. Submitted reviews are automatically screened by Amazon Rekognition before appearing in the public gallery — inappropriate images are rejected with a logged reason, while approved reviews are published with AI-generated descriptions.

---

## Architecture Overview

```
Frontend (Amplify)
      │
      ├── POST /upload-url  ──► GeneratePresignedURL Lambda ──► S3 Uploads Bucket
      │                                                               │
      │                                                    S3 Event Notification
      │                                                               │
      │                                                    ReviewProcessor Lambda
      │                                                      ├── Rekognition (moderation)
      │                                                      ├── Rekognition (labels)
      │                                                      ├── S3 Approved Bucket
      │                                                      └── DynamoDB
      │
      ├── POST /reviews     ──► SaveReview Lambda ──► DynamoDB
      │
      └── GET  /reviews     ──► ReviewAnalytics Lambda ──► DynamoDB
```

---

## Services Used

| Service | Purpose |
|---|---|
| AWS Amplify | Frontend hosting with GitHub CI/CD |
| API Gateway | REST API — `POST /upload-url`, `POST /reviews`, `GET /reviews` |
| Lambda (×4) | GeneratePresignedURL, SaveReview, ReviewProcessor, ReviewAnalytics |
| S3 (×2) | `review-images-uploads-reviewreko` (private), `approved-images-reviewreko` (public read) |
| Amazon Rekognition | Content moderation + label detection |
| DynamoDB | Review storage with GSI for category filtering |
| CloudWatch | Custom metrics dashboard — approvals vs rejections by category |

---

## How a Review Flows Through the System

1. User fills out the review form and selects a product image
2. Frontend generates a `reviewId` using `crypto.randomUUID()`
3. Image is sent directly to `POST /upload-url` — stored in S3 as `uploads/{reviewId}.{ext}`
4. Review metadata is sent to `POST /reviews` — written to DynamoDB with `status: PENDING`
5. The S3 upload triggers `ReviewProcessor` via S3 Event Notification
6. Rekognition runs `DetectModerationLabels` — if anything flags above 80% confidence, the record is updated to `REJECTED`
7. Rekognition runs `DetectLabels` — content labels are extracted for the AI description
8. Approved images are copied to the public S3 bucket; a plain-English description is generated from the detected labels
9. DynamoDB record is updated to `APPROVED` with the public image URL, labels, and AI description
10. A custom CloudWatch metric is pushed — dimensions: Status + Category

---

## Lambda Functions

### GeneratePresignedURL_ReviewReko
- Triggered by `POST /upload-url`
- Reads `x-review-id` header, uses it as the S3 filename: `uploads/{reviewId}.{ext}`
- Returns the `imageKey` to the frontend

### SaveReview_ReviewReko
- Triggered by `POST /reviews`
- Writes the full review record to DynamoDB with `status: PENDING`

### ReviewProcessor_ReviewReko
- Triggered by S3 `ObjectCreated:Put` on the `uploads/` prefix
- Runtime: Python 3.12 | Timeout: 30s | Memory: 256MB
- Runs Rekognition moderation and label detection
- Copies approved images to the public bucket
- Updates DynamoDB record with final status, labels, and AI description

### ReviewAnalytics_ReviewReko
- Triggered by `GET /reviews`
- `GET /reviews` → returns all `APPROVED` records (full table scan, filtered)
- `GET /reviews?category=footwear` → queries `category-index` GSI

---

## DynamoDB Schema

Table name: `review-decisions-reviewreko`  
Partition key: `reviewId` (String) — no sort key

| Field | Source |
|---|---|
| `reviewId` | Frontend (`crypto.randomUUID()`) |
| `timestamp` | Lambda |
| `customerName` | Frontend POST |
| `productName` | Frontend POST |
| `productCategory` | Frontend POST |
| `reviewText` | Frontend POST |
| `starRating` | Frontend POST |
| `imageKey` | ReviewProcessor (approved S3 public URL) |
| `status` | ReviewProcessor (`APPROVED` / `REJECTED` / `PENDING`) |
| `reason` | ReviewProcessor |
| `labelsDetected` | ReviewProcessor |
| `moderationFlags` | ReviewProcessor |
| `aiDescription` | ReviewProcessor |

### GSI — `category-index`
- Partition key: `productCategory`
- Sort key: `timestamp`
- Projection: All

Used by the frontend to filter the gallery by category without scanning the full table.

---

## Frontend

Single-page Astro application deployed on AWS Amplify. Two active sections controlled by vanilla JS tab navigation:

- **Submit Review** — form with image upload, sends to API Gateway
- **Browse Reviews** — gallery of approved reviews, filterable by category via the GSI

### Amplify Deployments

| Branch | URL |
|---|---|
| `main` | https://main.d1wca7itzjfmad.amplifyapp.com |
| `dev` | https://dev.d1wca7itzjfmad.amplifyapp.com |

### Local Development

```bash
npm install
npm run dev       # development server at localhost:4321
npm run build     # production build → dist/
npm run preview   # serve dist/ locally (mirrors Amplify output)
```

Amplify build is configured via `amplify.yml` — artifact base directory is `dist/`.

---

## API Reference

Base URL: `https://ptyne4n0cl.execute-api.eu-west-1.amazonaws.com/prod`

```
POST /upload-url
  Headers: Content-Type: <image mime type>, x-review-id: <uuid>
  Body:    raw image bytes
  Returns: { imageKey: string }

POST /reviews
  Body: { reviewId, customerName, productName, productCategory, starRating, reviewText, imageKey }
  Returns: 200 OK

GET /reviews
GET /reviews?category=footwear
  Returns: { statusCode: 200, body: "<JSON string — parse with JSON.parse(envelope.body)>" }
```

> **Note:** API Gateway Lambda Proxy Integration wraps responses in an envelope. The `body` field is a JSON string and must be parsed separately: `JSON.parse(envelope.body)`.

---

## Important Implementation Notes

**API Gateway redeployment** — every change to API Gateway requires a manual redeploy: Actions → Deploy API → prod stage. Changes do not go live automatically.

**CORS headers** — every Lambda response must include:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: *
```

**S3 Event Notification prefix** — the `uploads/` prefix on the S3 trigger is critical. Without it, every time ReviewProcessor copies an image to the approved bucket it would trigger itself again in an infinite loop.

**DynamoDB sort key** — the table has no sort key by design. Do not add one. All time-based sorting goes through the `category-index` GSI.

**Rekognition timeout** — ReviewProcessor has a 30s timeout. The default 3s Lambda timeout silently fails on Rekognition calls.

---

## CloudWatch Monitoring

Dashboard: `ReviewReko-Dashboard`  
Custom namespace: `ReviewSystem`  
Metric: `ProcessedImages`  
Dimensions: `Status` (APPROVED / REJECTED), `Category`

Line graph shows approval vs rejection rate over time, broken down by product category.

---

## Demo Scenarios

| Scenario | What to show |
|---|---|
| Normal approval | Submit a clean product photo → appears in gallery with labels and AI description |
| Content rejection | Submit an inappropriate image → status REJECTED with moderation flag and confidence % |
| Category filtering | Filter the gallery by different product categories using the GSI |
