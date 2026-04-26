import json # returns json to frontend
import boto3 # aws toolkit
from boto3.dynamodb.conditions import Attr, Key # required to filter by status = APPROVED and Key for filtering by category
import decimal # required for DecimalEncoder helper

import datetime # from timestamps to know when data was fetched

# Helper to fix DynamoDB Decimal serialization crashes
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)
#     What the Code Does
# This helper class "teaches" the JSON encoder how to handle those specific DynamoDB objects:

#     Subclassing: It extends json.JSONEncoder to override the default behavior.
#     Type Checking: It checks if an object is a decimal.Decimal.
#     Conditional Conversion:
#         If the number is a whole number (e.g., 10.0), it converts it to a standard int (10).
#         If it has decimal places (e.g., 10.5), it converts it to a standard float (10.5).
#     Fallback: For any other type (strings, booleans, etc.), it uses the standard JSON rules. 

#To apply this in your Lambda function, pass the class into the cls argument of your json.dumps() call: 

def lambda_handler(event, context):
    print(f"Full Event: {json.dumps(event)}") 

    # Safely extract query string parameters (handles cases where there are none)
    query_params = event.get('queryStringParameters') or {}
    category = query_params.get('category') # Will be None if key is missing

    # the resource
    dynamodb = boto3.resource('dynamodb')

    # the table
    table = dynamodb.Table('review-decisions-reviewreko')


    if category is not None: # if there is a specific category
    # SCENARIO: Category Filter -> Query GSI + Filter APPROVED
         # The user PROVIDED a category (even if it's "electronics" or "wrong")
        # We ONLY query. If nothing is found, items will be []

        print(f"Searching for specific category: {category}")
        response = table.query(
            IndexName='category-index',
            KeyConditionExpression=Key('productCategory').eq(category),
            FilterExpression=Attr('status').eq('APPROVED')
        )

        items = response.get('Items',[])

    else: # else - default request
          # The user DID NOT provide a ?category= parameter at all
        # Only now do we perform the expensive scan
        print("No category provided. Scanning for all approved items.")
        
        #scans only for approved images
        response = table.scan(
            FilterExpression=Attr('status').eq('APPROVED')
        )

        # gets the items, if not found gives empty array
        items = response.get('Items', [])

    # logging
    print(f'All items: {items}')

    # Create the dictionary first
    # Front-end Friendly: Your frontend can now check response.products for the data and response.message for the UI text.
    result_payload = {
        'products': items,
        'count': len(items),
        'message': "No products found" if not items else "",
        'timestamp': datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')  # Adds UTC time in ISO format with Z in the end without microseconds
        # like 2026-04-25T18:51:56Z

    }

    print(f'Result payload (body object): {result_payload}')


    to_return = { # returns python dict
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*'
        },
        # returns object with "body" with items inside 
        'body': json.dumps(result_payload, cls=DecimalEncoder)  # Using the DecimalEncoder helper here
    }

    print(f'Full response data before return: {to_return}')


    

    # General returns
    # Then dump it using encoder
    return to_return
