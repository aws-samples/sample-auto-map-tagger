const SERVICE_IOT = {
    source: 'aws.iot',
    events: ['CreateTopicRule', 'CreateAsset', 'CreateAssetModel', 'CreateGateway', 'CreatePortal'],
    permissions: ['iot:TagResource'],
};

