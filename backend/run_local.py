import json
# Import your handler function from your python file
from lambdas.ReviewAnalytics_ReviewReko import lambda_handler 

def run_test():
    # 1. Load the mock event
    with open("./lambdas/test events/category_footwear.json", "r") as f:
        event = json.load(f)
    
    # 2. Mock context (Lambda context is rarely needed for basic tests)
    context = {} 

    # 3. Call your handler
    print("--- Invoking Lambda Locally ---")
    response = lambda_handler(event, context)
    
    # 4. Print the output
    print(json.dumps(response, indent=2))

# The if __name__ == "__main__": block in Python ensures that certain code only runs when the script is executed directly, not when imported as a module in another script. It acts as a "guard," allowing a file to function both as a reusable library and a standalone script. 

# Best Practice: It provides a clear entry point for your application. 

# Direct Execution: When you run a script (e.g., python script.py), Python sets the special variable __name__ to "__main__".
if __name__ == "__main__":
    run_test()
