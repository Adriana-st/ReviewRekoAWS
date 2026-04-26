import json
import boto3
import os
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']

def lambda_handler(event, context):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*'
    }

    try:
        body = json.loads(event.get('body', '{}'))

        review_id = body.get('reviewId')
        if not review_id:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'reviewId is required'})
            }

        table = dynamodb.Table(DYNAMODB_TABLE)
        table.put_item(Item={
            'reviewId': review_id,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'customerName': body.get('customerName', ''),
            'productName': body.get('productName', ''),
            'productCategory': body.get('productCategory', ''),
            'starRating': body.get('starRating', 0),
            'reviewText': body.get('reviewText', ''),
            'imageKey': body.get('imageKey', ''),
            'status': 'PENDING',
            'reason': '',
            'labelsDetected': [],
            'moderationFlags': [],
            'aiDescription': ''
        })

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'Review saved', 'reviewId': review_id})
        }

    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': 'Internal server error'})
        }
