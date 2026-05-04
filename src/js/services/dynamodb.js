const SERVICE_DYNAMODB = {
    source: 'aws.dynamodb',
    events: ['CreateTable', 'RestoreTableFromBackup', 'RestoreTableToPointInTime'],
    permissions: ['dynamodb:TagResource'],
};

