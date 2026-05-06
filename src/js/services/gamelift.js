const SERVICE_GAMELIFT = {
    source: 'aws.gamelift',
    events: ['CreateBuild', 'CreateScript', 'CreateFleet'],
    permissions: ['gamelift:TagResource'],
};

