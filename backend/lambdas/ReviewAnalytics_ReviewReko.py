import json # returns json to frontend
import boto3 # aws toolkit
from boto3.dynamodb.conditions import Attr # required to filter by status = APPROVED
import decimal

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
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table('review-decisions-reviewreko')

    response = table.scan(
        FilterExpression=Attr('status').eq('APPROVED')
    )
    items = response.get('Items', [])

    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*'
        },
        'body': json.dumps(items, cls=DecimalEncoder)  # Using the helper here
    }
    