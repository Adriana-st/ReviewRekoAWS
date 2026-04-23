import boto3
import json
import uuid
import os
import base64

s3 = boto3.client('s3', region_name='eu-west-1')

UPLOAD_BUCKET = os.environ['UPLOAD_BUCKET']


def lambda_handler(event, context):
    try:
        # Handle CORS preflight
        if event.get('httpMethod') == 'OPTIONS':
            return response(200, {})

        body = event.get('body', '')
        is_base64 = event.get('isBase64Encoded', False)

        if is_base64:
            image_data = base64.b64decode(body)
        else:
            image_data = body.encode('utf-8') if isinstance(body, str) else body

        # Get content type from headers
        headers = event.get('headers') or {}
        content_type = headers.get('content-type') or headers.get('Content-Type') or 'image/jpeg'

        # Validate image type
        allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if content_type not in allowed_types:
            return response(400, {'error': 'Only image files are allowed'})

        ext = content_type.split('/')[-1]
        if ext == 'jpeg':
            ext = 'jpg'
        image_key = f'uploads/{uuid.uuid4()}.{ext}'

        # Upload directly to S3 from Lambda — no CORS issue
        s3.put_object(
            Bucket=UPLOAD_BUCKET,
            Key=image_key,
            Body=image_data,
            ContentType=content_type
        )

        return response(200, {
            'imageKey': image_key,
            'message': 'Image uploaded successfully'
        })

    except Exception as e:
        print(f'Error: {str(e)}')
        return response(500, {'error': str(e)})


def response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'POST,OPTIONS'
        },
        'body': json.dumps(body)
    }
