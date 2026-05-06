const SERVICE_S3 = {
    source: 'aws.s3',
    events: ['CreateBucket'],
    permissions: ['s3:PutBucketTagging', 's3:GetBucketTagging'],
};

