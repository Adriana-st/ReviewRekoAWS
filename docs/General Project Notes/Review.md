# ReviewReko — System Overview

ReviewReko is a serverless image moderation and product review platform built on AWS. Customers submit product reviews with images. Images are automatically screened by Rekognition, and only approved content is published to the public gallery. The system is structured in three layers: input, processing, and output.

---

## Services used

- S3 (two buckets)
- AWS Lambda (three functions)
- Amazon API Gateway
- Amazon Rekognition
- Amazon DynamoDB
- AWS Amplify
- Amazon CloudWatch

---

## Input layer

### Frontend — hosted on AWS Amplify

A single HTML page with two sections: a review submission form and an approved review gallery with category filtering. Deployed on the main branch: https://main.d1wca7itzjfmad.amplifyapp.com

On submission, JavaScript generates a `reviewId` using `crypto.randomUUID()`. It passes this ID as an `x-review-id` header to `POST /upload-url`, uploads the image directly to S3 using the returned presigned URL, then sends the review metadata (including the same `reviewId`) to `POST /reviews`.

### API Gateway — Gateway_ReviewReko

Base URL: https://ptyne4n0cl.execute-api.eu-west-1.amazonaws.com/prod

- `POST /upload-url` → GeneratePresignedURL_ReviewReko Lambda
- `POST /reviews` → SaveReview_ReviewReko Lambda
- `GET /reviews` → ReviewAnalytics_ReviewReko Lambda

CORS is enabled on all endpoints. The `/upload-url` endpoint explicitly allows the `x-review-id` custom header.

Every API Gateway change requires a manual redeploy (Actions → Deploy API → prod) before it takes effect.

### Lambda — GeneratePresignedURL_ReviewReko

Reads the `x-review-id` header and uses it as the S3 image filename: `uploads/{reviewId}.{ext}`. Returns a presigned PUT URL to the frontend. The frontend uploads the image directly to S3 from the browser — the image never passes through Lambda.

Environment variables: `UPLOAD_BUCKET` = `review-images-uploads-reviewreko`

### Lambda — SaveReview_ReviewReko

Triggered by `POST /reviews`. Receives the full review form data and writes a record to DynamoDB with `status: PENDING`. ReviewProcessor updates this same record later using the shared `reviewId`.

Environment variables: `DYNAMODB_TABLE` = `review-decisions-reviewreko`

IAM: `dynamodb:PutItem`, `dynamodb:UpdateItem` on the table only.

---

## Processing layer

### S3 uploads bucket — review-images-uploads-reviewreko

Private (block all public access ON). Raw incoming images land here. An S3 Event Notification is configured with prefix `uploads/` and event type `s3:ObjectCreated:Put`, pointing at ReviewProcessor Lambda. The prefix is critical — without it, every copy ReviewProcessor makes to the approved bucket would retrigger it in an infinite loop.

### Lambda — ReviewProcessor_ReviewReko

Runtime: Python 3.12. Timeout: 30s. Memory: 256MB.

Triggered by the S3 event notification. Processes each image in this order:

1. Extracts `reviewId` from the image key (e.g. `uploads/abc-123.jpg` → `abc-123`)
2. Calls Rekognition `DetectModerationLabels` — if any label exceeds the confidence threshold, writes a REJECTED record to DynamoDB with reason and flags, then stops
3. Calls Rekognition `DetectLabels` — gets the content labels for the image
4. Copies the image from the uploads bucket to the approved bucket
5. Generates a plain-English description from the detected labels in Python (Bedrock is not available on the student account)
6. Uses `update_item` by `reviewId` to update the existing DynamoDB record with: status APPROVED, imageKey (public S3 URL), labelsDetected, moderationFlags, aiDescription, timestamp
7. Pushes a custom metric to CloudWatch with dimensions: Status and Category

Environment variables: `UPLOAD_BUCKET`, `APPROVED_BUCKET` = `approved-images-reviewreko`, `DYNAMODB_TABLE`, `MODERATION_THRESHOLD` = `80`

IAM: `s3:GetObject` on uploads bucket, `s3:PutObject` on approved bucket, `rekognition:DetectModerationLabels`, `rekognition:DetectLabels`, `dynamodb:PutItem`, `dynamodb:UpdateItem`, `cloudwatch:PutMetricData`

### S3 approved bucket — approved-images-reviewreko

Block all public access OFF. Bucket policy allows `s3:GetObject` for all principals. Images copied here after passing moderation. The frontend loads them directly as `<img src="...">` using the public URL stored in DynamoDB.

### DynamoDB table — review-decisions-reviewreko

Partition key: `reviewId` (String). No sort key. Capacity: on-demand.

GSI: `category-index` — partition key `productCategory` (String), sort key `timestamp` (String), projected attributes: All. This GSI is what powers category filtering in the gallery without scanning the full table.

Fields in each record: `reviewId`, `timestamp`, `customerName`, `productName`, `productCategory`, `reviewText`, `starRating`, `imageKey`, `status` (APPROVED / REJECTED / PENDING), `reason`, `labelsDetected`, `moderationFlags`, `aiDescription`

### CloudWatch — ReviewReko-Dashboard

ReviewProcessor pushes a custom metric `ProcessedImages` to namespace `ReviewSystem` after every decision, with dimensions Status and Category. A CloudWatch dashboard displays approvals vs rejections over time as a line graph.

---

## Output layer

### Lambda — ReviewAnalytics_ReviewReko

Triggered by `GET /reviews` via API Gateway. Handles two scenarios:

- `GET /reviews` — scans the table and filters for status = APPROVED
- `GET /reviews?category=footwear` — queries the `category-index` GSI by `productCategory`, filters for status = APPROVED

Returns records as JSON. The `imageKey` field in each approved record is the full public S3 URL, loaded directly by the frontend as an `<img>` tag.

IAM: `dynamodb:Query`, `dynamodb:Scan` on the table only.

---

## Things to know

- Every Lambda response must include `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Headers: *` or the browser will reject the response
- Every API Gateway change requires a manual redeploy before it goes live
- The DynamoDB table has no sort key — do not add one. All time-sorted queries use the GSI
- The S3 event notification prefix `uploads/` must not be removed — it prevents the infinite loop
