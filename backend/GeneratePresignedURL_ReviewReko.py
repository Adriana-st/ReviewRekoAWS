import boto3
import json
import uuid
import os
from botocore.config import Config

# Force signature version 4 and correct region
s3 = boto3.client(
    's3',
    region_name='eu-west-1',
    config=Config(signature_version='s3v4')
)

UPLOAD_BUCKET = os.environ['UPLOAD_BUCKET']


def lambda_handler(event, context):
    try:
        params = event.get('queryStringParameters') or {}
        filename = params.get('filename', '')
        content_type = params.get('contentType', 'image/jpeg')

        if not filename:
            return response(400, {'error': 'filename is required'})

        allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if content_type not in allowed_types:
            return response(400, {'error': 'Only image files are allowed'})

        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
        image_key = f'uploads/{uuid.uuid4()}.{ext}'

        # Generate presigned URL with explicit content type condition
        upload_url = s3.generate_presigned_url(
            ClientMethod='put_object',
            Params={
                'Bucket': UPLOAD_BUCKET,
                'Key': image_key,
                'ContentType': content_type
            },
            ExpiresIn=300
        )

        return response(200, {
            'uploadUrl': upload_url,
            'imageKey': image_key,
            'contentType': content_type
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
            'Access-Control-Allow-Methods': 'GET,OPTIONS'
        },
        'body': json.dumps(body)
    }
