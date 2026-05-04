const SERVICE_KINESIS = {
    source: 'aws.kinesis',
    events: ['CreateStream'],
    permissions: ['kinesis:AddTagsToStream'],
};

