const SERVICE_FIREHOSE = {
    source: 'aws.firehose',
    events: ['CreateDeliveryStream'],
    permissions: ['firehose:TagDeliveryStream'],
};

