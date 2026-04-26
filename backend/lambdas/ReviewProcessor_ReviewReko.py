import json
import boto3
import os
from datetime import datetime, timezone

s3 = boto3.client('s3')
rekognition = boto3.client('rekognition')
dynamodb = boto3.resource('dynamodb')
cloudwatch = boto3.client('cloudwatch')

UPLOAD_BUCKET = os.environ['UPLOAD_BUCKET']
APPROVED_BUCKET = os.environ['APPROVED_BUCKET']
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
MODERATION_THRESHOLD = float(os.environ['MODERATION_THRESHOLD'])

def lambda_handler(event, context):
    record = event['Records'][0]
    image_key = record['s3']['object']['key']

    # Extract reviewId from image key e.g. "uploads/abc-123.jpg" → "abc-123"
    filename = image_key.split('/')[-1]
    review_id = filename.rsplit('.', 1)[0]
    timestamp = datetime.now(timezone.utc).isoformat()

    print(f"Processing image: {image_key}, reviewId: {review_id}")

    allowed_extensions = ['.jpg', '.jpeg', '.png']
    ext = '.' + image_key.rsplit('.', 1)[-1].lower()
    if ext not in allowed_extensions:
        print(f"Unsupported format: {ext}")
        update_decision(review_id, timestamp, image_key, 'REJECTED',
                    'unsupported_format', [], [], '')
        push_metric('REJECTED', 'unknown')
        return
        
    # STEP 1 — Moderation check
    moderation_response = rekognition.detect_moderation_labels(
        Image={'S3Object': {'Bucket': UPLOAD_BUCKET, 'Name': image_key}},
        MinConfidence=MODERATION_THRESHOLD
    )

    moderation_flags = [
        label['Name'] for label in moderation_response['ModerationLabels']
    ]

    if moderation_flags:
        print(f"Rejected (inappropriate content): {moderation_flags}")
        update_decision(review_id, timestamp, image_key, 'REJECTED',
                       'inappropriate_content', [], moderation_flags, '')
        push_metric('REJECTED', 'unknown')
        return

    # STEP 2 — Label detection
    labels_response = rekognition.detect_labels(
        Image={'S3Object': {'Bucket': UPLOAD_BUCKET, 'Name': image_key}},
        MinConfidence=70
    )

    label_names = [label['Name'] for label in labels_response['Labels']]
    print(f"Labels detected: {label_names}")

    # STEP 3 — Copy to approved bucket
    approved_key = image_key.replace('uploads/', 'approved/')
    s3.copy_object(
        CopySource={'Bucket': UPLOAD_BUCKET, 'Key': image_key},
        Bucket=APPROVED_BUCKET,
        Key=approved_key
    )
    approved_url = f"https://{APPROVED_BUCKET}.s3.eu-west-1.amazonaws.com/{approved_key}"
    print(f"Image approved and copied to: {approved_url}")

    # STEP 4 — Generate description from labels
    ai_description = generate_description(label_names)

    # STEP 5 — Update record
    update_decision(review_id, timestamp, approved_url, 'APPROVED',
                   'none', label_names, [], ai_description)
    push_metric('APPROVED', 'general')


def update_decision(review_id, timestamp, image_key, status,
                   reason, labels, moderation_flags, ai_description):
    table = dynamodb.Table(DYNAMODB_TABLE)
    table.update_item(
        Key={'reviewId': review_id},
        UpdateExpression="""SET #st = :status, reason = :reason,
            imageKey = :imageKey,
            labelsDetected = :labels,
            moderationFlags = :flags,
            aiDescription = :desc,
            #ts = :timestamp""",
        ExpressionAttributeNames={
            '#st': 'status',
            '#ts': 'timestamp'
        },
        ExpressionAttributeValues={
            ':status': status,
            ':reason': reason,
            ':imageKey': image_key,
            ':labels': labels,
            ':flags': moderation_flags,
            ':desc': ai_description,
            ':timestamp': timestamp
        }
    )


def push_metric(status, category):
    cloudwatch.put_metric_data(
        Namespace='ReviewSystem',
        MetricData=[{
            'MetricName': 'ProcessedImages',
            'Value': 1,
            'Unit': 'Count',
            'Dimensions': [
                {'Name': 'Status', 'Value': status},
                {'Name': 'Category', 'Value': category}
            ]
        }]
    )


def generate_description(labels):
    if not labels:
        return 'No description available'
    if len(labels) == 1:
        return f"An image showing {labels[0].lower()}"
    return f"An image showing {', '.join(l.lower() for l in labels[:-1])} and {labels[-1].lower()}"
