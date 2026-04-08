
# Setup Standards for AWS: Monorepo

As a Senior AWS Architect, I strongly endorse using Python for your Lambda functions. Python is the dominant industry standard for serverless backends, especially with the rise of AI, data processing, and robust scripting needs. It has zero cold-start overhead compared to heavier runtimes like Java, and its ecosystem is unmatched.

For a solo developer, moving to AWS Lambda requires a mental shift. You are no longer just writing code; you are building distributed systems. 

## Don't use Localstack

The biggest trap solo developers fall into with Lambdas is trying to simulate the entire AWS cloud on their local laptop using heavy Docker containers (like LocalStack). The modern industry standard is **Cloud-Local Development**: unit test your business logic locally in Python, but test your infrastructure directly in the AWS Cloud.

Here is the end-to-end framework for structuring, testing, and deploying Python Lambdas using **AWS CDK (Cloud Development Kit)** and a **Monorepo** approach.

---

### 1. Repository Strategy: The Monorepo
**Should you store them in the same repo?** **Absolutely yes.** 

For a solo developer, separating frontend and backend into multiple repositories is a massive operational burden. You want a single Pull Request to contain both your backend Python API changes and your frontend HTML/UI changes. 

**Standard Folder Structure:**
```text
/my-saas
  /frontend         # Your Amplify HTML/JS app
  /backend          # Lambda source code (Python)
    /src            # Python handlers and logic
    /tests          # pytest suite
    requirements.txt
  /infrastructure   # AWS CDK code defining your Lambdas, API GW (Python)
  .github/workflows # CI/CD pipelines
```

---

### 2. The Toolchain
To do this properly, you need Infrastructure-as-Code (IaC). Clicking around the AWS Console to create Lambdas is unmaintainable and impossible to version-control.

*   **Infrastructure as Code:** **AWS CDK** (We will use Python for the CDK code too, keeping your entire backend stack in one language).
*   **Local Testing (Unit):** **`pytest`**.
*   **Cloud Testing (Integration):** `cdk watch` (Deploys code changes to AWS in seconds).
*   **CI/CD Pipeline:** **GitHub Actions**.

---

### 3. How to Write and Test Python Lambdas Properly

The secret to testing Lambdas is **not** testing the Lambda itself locally. The secret is decoupling your business logic from the AWS handler. 

#### The Code (Hexagonal Architecture "Lite")
Do not put your logic inside the `handler` function. Pass the event payload to a pure Python function.

**`backend/src/create_user.py`**
```python
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# 1. The Pure Business Logic (Easily tested locally with pytest without AWS)
def process_user_creation(email: str, db_client=None):
    if "@" not in email:
        raise ValueError("Invalid email format")
    
    # Example: db_client.put_item(Item={"PK": f"USER#{email}"})
    logger.info(f"Successfully processed user: {email}")
    
    return {"success": True, "email": email}

# 2. The AWS Lambda Handler (Only parses inputs and formats outputs)
def handler(event, context):
    try:
        # Extract data from API Gateway event
        body = json.loads(event.get("body", "{}"))
        email = body.get("email")

        # Execute core logic
        result = process_user_creation(email)

        # Return standard API Gateway response
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(result)
        }
    except ValueError as ve:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": str(ve)})
        }
    except Exception as e:
        logger.error(f"Internal server error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Internal server error"})
        }
```

#### How to Test
1.  **Local Unit Testing:** Write simple `pytest` tests for `process_user_creation`. This runs in milliseconds on your laptop. No AWS required.
2.  **Local Execution/Hot Reload:** For testing the actual API endpoint, use **CDK Watch**. 
    *   Run `cdk watch` in your terminal.
    *   Every time you hit save on your Python code, CDK directly swaps the code in AWS in about 2-3 seconds, bypassing the slow CloudFormation process.
    *   You hit the live, personal development API Gateway URL via Postman/cURL to test it.

---

### 4. Defining the Infrastructure (AWS CDK)

Instead of manual setup, you define your API and Lambda in code. 

**`infrastructure/app_stack.py`**
```python
from aws_cdk import (
    Stack,
    CfnOutput,
    aws_lambda as _lambda,
    aws_apigatewayv2 as apigw,
    aws_apigatewayv2_integrations as integrations,
)
from constructs import Construct

class BackendStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # 1. Define the Python Lambda
        create_user_lambda = _lambda.Function(
            self, "CreateUserFunction",
            runtime=_lambda.Runtime.PYTHON_3_12,
            architecture=_lambda.Architecture.ARM_64, # 💰 ARM64 is 20% cheaper and faster!
            code=_lambda.Code.from_asset("../backend/src"), # Points to your Python folder
            handler="create_user.handler",
            memory_size=256,
        )

        # 2. Define the HTTP API Gateway (Cheaper and faster than standard REST API)
        http_api = apigw.HttpApi(
            self, "SaaSHttpApi",
            api_name="SaaS Backend",
            cors_preflight=apigw.CorsPreflightOptions(
                allow_origins=["https://your-amplify-domain.com"],
                allow_methods=[apigw.CorsHttpMethod.ANY]
            )
        )

        # 3. Connect API to Lambda
        http_api.add_routes(
            path="/users",
            methods=[apigw.HttpMethod.POST],
            integration=integrations.HttpLambdaIntegration(
                "UserIntegration", create_user_lambda
            )
        )

        # Output the API URL to the terminal
        CfnOutput(self, "ApiUrl", value=http_api.api_endpoint)
```

---

### 5. Automated Deployment (CI/CD)

GitHub Actions will handle your backend, while Amplify handles your frontend. 

**`.github/workflows/deploy-backend.yml`**
```yaml
name: Deploy Python Backend via CDK

on:
  push:
    branches:
      - main
    paths:
      - 'backend/**'
      - 'infrastructure/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Python 3.12
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install CDK and dependencies
        run: |
          npm install -g aws-cdk
          pip install -r infrastructure/requirements.txt

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-west-1 # Adjust to your region

      - name: Deploy CDK Stack
        working-directory: ./infrastructure
        run: cdk deploy --require-approval never
```

---

### ⚠️ Architecture Pitfalls to Avoid

1.  **Wildcard IAM Roles:** Never give a Lambda `*` (admin) permissions. If your Python Lambda needs to read from a DynamoDB table, use the CDK helper: `my_table.grant_read_data(create_user_lambda)`. CDK will generate the exact, least-privilege IAM policy required.
2.  **Using API Gateway REST API instead of HTTP API:** Unless you need Web Application Firewall (WAF), API keys, or request validation at the gateway level, use **HTTP APIs**. They are 71% cheaper and have less latency.
3.  **Not Using ARM64:** Always set your Python Lambda architecture to `ARM_64` (Graviton). Python runs natively on ARM, giving you better performance and a 20% cost reduction out of the box with zero code changes.
4.  **Secrets in Environment Variables:** Do not hardcode database passwords or third-party API keys in Lambda Environment Variables (they are visible in plain text in the console). Store them in **AWS Systems Manager (SSM) Parameter Store** and fetch them securely inside your Python code using `boto3`, or utilize the AWS Parameters and Secrets Lambda Extension for caching to avoid API rate limits and extra costs.
5.  **Global Variable Re-use:** In Python, initialize connections (like `boto3.client('dynamodb')` or database connections) *outside* the handler function. AWS freezes the execution environment between invocations; declaring these globally allows subsequent Lambda executions to reuse the connection, drastically reducing latency.