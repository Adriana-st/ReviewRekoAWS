https://claude.ai/share/94d8ca01-6532-44dd-b1af-6c3cd2bcb0d9


Your system has three distinct layers:


**Input layer** — the HTML page where a user submits a review and uploads a photo


**Processing layer** — S3 triggers Lambda, Lambda calls Rekognition (and optionally Bedrock), result gets saved to DynamoDB


**Output layer** — the HTML page also displays approved reviews, filterable by category


Every service has one clear job. Nothing is there just to hit a number.


Service 1 — S3
--------------


You need **two buckets**:


review-images-uploads — raw incoming images land here. This bucket is private. Nobody should be able to access these directly because they haven't been moderated yet.


review-images-approved — images that passed all checks get copied here. This bucket can be public-read so your frontend can display them as  tags directly.


The upload bucket has one critical setting: an **Event Notification** configured to fire on s3:ObjectCreated:\* events, pointing at your Lambda function. This is what starts the whole pipeline automatically the moment an image arrives.


**Important:** you also need a prefix filter on that trigger — set it to uploads/ — so Lambda only fires on new incoming images, not on anything else happening in the bucket.


Service 2 — Lambda
------------------


One main function does steps 2 through 6. It receives the S3 event, runs Rekognition, makes the moderation decision, optionally calls Bedrock, and writes to DynamoDB.


The function needs these **environment variables** set in the Lambda console under Configuration → Environment Variables:


KeyExample valueAPPROVED\_BUCKETreview-images-approvedDYNAMODB\_TABLEreview-decisionsMODERATION\_THRESHOLD80


**Runtime:** Python 3.12. **Timeout:** increase it from the default 3 seconds to 30 seconds — Rekognition and Bedrock calls take time and your function will silently fail if it times out.


**Memory:** 256MB is fine. The image never passes through Lambda memory — you're just passing S3 references around, not loading image bytes.


Service 3 — Rekognition
-----------------------


Two separate API calls, run in sequence:


**Call 1 — DetectModerationLabels**


Sends the S3 reference (bucket + key) to Rekognition. Gets back a list of anything unsafe detected above your confidence threshold. If the list is non-empty, reject immediately. You never run Call 2 on a rejected image — no point spending the API call.


**Call 2 — DetectLabels**


Only runs if Call 1 returned nothing. This is what tells you what's actually _in_ the image — "Shoe", "Red", "Outdoor", "Electronics" etc. You store these labels in DynamoDB as the tags that power your filtering on the frontend.


One useful thing to check for here: Rekognition returns a "Blurry" label when image quality is too poor. You can reject blurry images as a quality gate — a blurry review photo is useless to other customers and worth showing as a separate rejection scenario in your demo.


Service 4 — DynamoDB
--------------------


One table called review-decisions.


**Table design:**


*   Partition key: reviewId (String) — a unique ID you generate per review
    
*   Sort key: timestamp (String) — ISO format datetime
    


**Add one GSI (Global Secondary Index):**


*   Index name: category-index
    
*   Partition key: category (String)
    
*   Sort key: timestamp (String)
    


The GSI is what lets your frontend query "show me all footwear reviews" efficiently without scanning the entire table. You add it when creating the table — it's a few extra fields in the console, takes two minutes, and shows your lecturer you understand how NoSQL access patterns work.


**What each record looks like:**


json


`   {    "reviewId": "abc123",    "timestamp": "2026-04-05T14:32:00Z",    "customerId": "cust_456",    "productCategory": "footwear",    "reviewText": "Really comfortable, great quality",    "imageKey": "approved/footwear/abc123.jpg",    "status": "APPROVED",    "reason": "none",    "labelsDetected": ["Shoe", "Red", "Outdoor"],    "aiDescription": "A red running shoe photographed outdoors",    "moderationFlags": []  }   `


For rejected images the record looks the same but status is "REJECTED", reason is something like "inappropriate\_content" or "blurry\_image", and imageKey stays in the uploads bucket rather than approved.


Service 5 — API Gateway
-----------------------


Two endpoints, both GET, both trigger small Lambda functions:


**GET /reviews** — returns all approved reviews, optionally filtered by ?category=footwear


**GET /reviews/{reviewId}** — returns a single review record by ID


That's it. Your frontend calls these to populate the review display. You configure each endpoint in API Gateway, point them at Lambda, and enable CORS (there's a checkbox — without it your HTML page will get browser errors when trying to call the API).


Service 6 — Bedrock (optional but recommended)
----------------------------------------------


If your school account has it enabled, this is one extra function call inside your main Lambda, run after DetectLabels passes:


python


`   prompt = f"""  The following objects were detected in a product review image:  {', '.join(detected_labels)}  Write one natural sentence describing what this image shows,  as it would appear in a product review. Maximum 15 words.  """   `


You pass that prompt to Claude Haiku on Bedrock and store the response as aiDescription in DynamoDB. The frontend displays it under the review image. It costs fractions of a penny per call and takes under a second.


If Bedrock isn't available, just store the raw labels instead and skip the description field — the rest of the system is identical.


Service 7 — CloudWatch
----------------------


Lambda sends logs here automatically — you don't configure anything for basic logging. What you _do_ want to add manually is a **custom metric** inside your Lambda after every decision:


python


`   cloudwatch.put_metric_data(      Namespace='ReviewSystem',      MetricData=[{          'MetricName': 'ProcessedImages',          'Value': 1,          'Unit': 'Count',          'Dimensions': [              {'Name': 'Status', 'Value': status},              {'Name': 'Category', 'Value': category}          ]      }]  )   `


This lets you build a CloudWatch dashboard showing approvals vs rejections over time, broken down by category. That's what you show in the demo for the monitoring marks — a real operational graph, not just raw log lines.


The Frontend
------------


One HTML file, hosted as a static website on S3. Three sections:


**Submit a review** — product name, category dropdown, star rating, text box, file upload, submit button. On submit, JavaScript calls your API Gateway upload endpoint, gets back a presigned S3 URL, and uploads the image directly to S3 from the browser. Then it posts the review metadata to a second endpoint.


**My submission result** — after submitting, shows whether the image was approved or rejected and why.


**Browse reviews** — calls GET /reviews (or filtered by category) and renders a grid of approved review images with their text, labels, rating, and Bedrock description if you have it.


Adriana can style this however she wants — the AWS connections are all in about 50 lines of JavaScript, the rest is pure HTML and CSS.
