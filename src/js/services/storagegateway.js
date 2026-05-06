const SERVICE_STORAGEGATEWAY = {
    source: 'aws.storagegateway',
    events: ['ActivateGateway', 'CreateTapePool'],
    permissions: ['storagegateway:AddTagsToResource'],
};

