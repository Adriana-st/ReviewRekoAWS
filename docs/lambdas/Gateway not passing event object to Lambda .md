If your Full Event is {} in CloudWatch, it means API Gateway is not passing the request data to Lambda.
In AWS API Gateway, there are two ways to trigger a Lambda. You are currently using the "Legacy/Standard" integration instead of the "Proxy" integration.
## The Fix (AWS Console)

   1. Go to the API Gateway Console.
   2. Select your API (ptyne4n0cl).
   3. Click on the Resource (e.g., /reviews) and the Method (e.g., GET).
   4. Click on Integration Request.
   5. Check the box that says "Use Lambda Proxy integration".
   6. CRITICAL: You must click Actions -> Deploy API and select your stage (e.g., prod) for the change to take effect.

## Why this is happening:

* Without Proxy Integration: API Gateway tries to "map" the request. If no mapping template is defined, it sends an empty object {} to Lambda.
* With Proxy Integration: API Gateway passes the entire HTTP request (headers, query strings, path) directly into the event object, which is what your code expects.

## Check your Frontend/CURL again
Once you enable Proxy Integration, your Full Event log will suddenly explode with data, including:

{
  "queryStringParameters": {"category": "electronics"},
  "headers": {...},
  "requestContext": {...}
}

Have you checked the "Lambda Proxy integration" box in the API Gateway settings yet?

