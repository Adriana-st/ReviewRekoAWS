import boto3
import json
import uuid
import os
from botocore.config import Config

# Force SigV4 and pin the region — both are required for presigned URLs
# to work correctly from a browser
s3 = boto3.client(
    's3',
    region_name='eu-west-1',
    config=Config(
        signature_version='s3v4',
        region_name='eu-west-1'
    )
)

UPLOAD_BUCKET = os.environ['UPLOAD_BUCKET']

ALLOWED_TYPES = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
}


def lambda_handler(event, context):
    # Handle CORS preflight
    if event.get('httpMethod') == 'OPTIONS':
        return response(200, {})

    try:
        params = event.get('queryStringParameters') or {}
        filename = params.get('filename', '').strip()
        content_type = params.get('contentType', '').strip()

        if not filename:
            return response(400, {'error': 'filename query parameter is required'})

        if content_type not in ALLOWED_TYPES:
            return response(400, {'error': f'Unsupported file type: {content_type}. Allowed: {list(ALLOWED_TYPES.keys())}'})

        ext = ALLOWED_TYPES[content_type]

        # Use reviewId passed from frontend so Lambda and S3 key share the same ID
        # Falls back to a fresh UUID if not provided
        review_id = params.get('reviewId') or str(uuid.uuid4())
        image_key = f'uploads/{review_id}.{ext}'

        # Generate presigned PUT URL — valid for 5 minutes
        # ContentType condition ensures the browser must send the matching
        # Content-Type header in its PUT request, which satisfies S3 CORS
        upload_url = s3.generate_presigned_url(
            ClientMethod='put_object',
            Params={
                'Bucket': UPLOAD_BUCKET,
                'Key': image_key,
                'ContentType': content_type,
            },
            ExpiresIn=300,
        )

        print(f'Generated presigned URL for key: {image_key}')

        return response(200, {
            'uploadUrl': upload_url,
            'imageKey': image_key,
            'reviewId': review_id,
        })

    except Exception as e:
        print(f'Error generating presigned URL: {str(e)}')
        return response(500, {'error': 'Failed to generate upload URL'})


def response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,OPTIONS',
        },
        'body': json.dumps(body),
    }
