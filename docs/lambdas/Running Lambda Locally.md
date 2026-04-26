To test your AWS Lambda function locally within a uv project, the simplest method is to create a small "runner" script that imports your handler and calls it with a JSON event. [1, 2] 
## 1. Create a Test Event File [3] 
First, save your curl request data into a file named event.json in your project root. [4, 5] 

{
  "resource": "/reviews",
  "path": "/reviews",
  "httpMethod": "GET",
  "headers": {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
    "Origin": "http://127.0.0.1:4321"
  },
  "queryStringParameters": {
    "category": "footwear"
  },
  "requestContext": {
    "stage": "prod"
  },
  "isBase64Encoded": false
}

## 2. Create a Local Runner Script
Create a new file called run_local.py. This script loads your event.json and passes it to your lambda_handler. [2] 

import jsonimport sys# Import your handler function from your python filefrom lambda_function import lambda_handler 
def run_test():
    # 1. Load the mock event
    with open("event.json", "r") as f:
        event = json.load(f)
    
    # 2. Mock context (Lambda context is rarely needed for basic tests)
    context = {} 

    # 3. Call your handler
    print("--- Invoking Lambda Locally ---")
    response = lambda_handler(event, context)
    
    # 4. Print the output
    print(json.dumps(response, indent=2))
if __name__ == "__main__":
    run_test()

## 3. Run with uv
Since you are using uv, you can run this script using your managed environment: [1, 6] 

uv run run_local.py

## Alternative: Use python-lambda-local [4] 
If you prefer a command-line tool, you can use the [python-lambda-local](https://pypi.org/project/python-lambda-local/) package: [4, 7, 8] 

   1. Install it via uv: uv add python-lambda-local
   2. Run it directly:
   
   uv run python-lambda-local -f lambda_handler lambda_function.py event.json
   
   [4, 8] 

## Pro Tip: Debugging in VS Code
If you use VS Code, you can also use the [AWS Toolkit extension](https://aws.amazon.com/blogs/compute/introducing-an-enhanced-local-ide-experience-for-aws-lambda-developers/) to right-click your function and select "Run Locally," which allows you to attach a debugger and step through your code. [3, 4, 9, 10] 
Do you need help extracting the category parameter from the event object inside your Python code?

import json
event = {
  "resource": "/reviews",
  "path": "/reviews",
  "httpMethod": "GET",
  "headers": {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
    "category": "footwear"
  },
  "queryStringParameters": {
    "category": "footwear"
  },
  "requestContext": {
    "stage": "prod",
    "httpMethod": "GET"
  },
  "isBase64Encoded": False
}
# Example of how to wrap it in a local runner scriptrunner_script = f"""
import json
from lambda_function import lambda_handler # Assumes your file is lambda_function.py

# The event from your curl request
event = {json.dumps(event, indent=2)}

context = {{}} # Lambda context is usually empty for basic local tests

if __name__ == "__main__":
    response = lambda_handler(event, context)
    print(json.dumps(response, indent=2))"""

print(runner_script)


[1] [https://stackoverflow.com](https://stackoverflow.com/questions/43121621/how-can-i-test-lambda-in-local-using-python)
[2] [https://medium.com](https://medium.com/geekculture/debug-lambdas-locally-without-sam-docker-or-anythin-eb68761dd9c4)
[3] [https://aws.amazon.com](https://aws.amazon.com/blogs/compute/introducing-an-enhanced-local-ide-experience-for-aws-lambda-developers/)
[4] [https://medium.com](https://medium.com/@bezdelev/how-to-test-a-python-aws-lambda-function-locally-with-pycharm-run-configurations-6de8efc4b206)
[5] [https://aws.amazon.com](https://aws.amazon.com/blogs/devops/unit-testing-aws-lambda-with-python-and-mock-aws-services/)
[6] [https://docs.aws.amazon.com](https://docs.aws.amazon.com/lambda/latest/dg/lambda-python.html)
[7] [https://pypi.org](https://pypi.org/project/python-lambda-local/#:~:text=Run%20the%20lambda%20function.%20Within%20the%20project,%2D%20INFO%20%2D%202018%2D11%2D20%2017:10:53%2C360%5D%20RESULT:%20None.)
[8] [https://xebia.com](https://xebia.com/blog/testing-an-aws-lambda-function-locally/)
[9] [https://www.youtube.com](https://www.youtube.com/watch?v=rhBOuJqzABY)
[10] [https://bixlerm.medium.com](https://bixlerm.medium.com/running-aws-lambdas-locally-w-vs-code-8e6a2d6b895c#:~:text=Conclusion%20*%20At%20this%20point%20your%20entire,know%20of%20any%20issues%2C%20improvements%2C%20comments%20below!)
