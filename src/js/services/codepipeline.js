const SERVICE_CODEPIPELINE = {
    source: 'aws.codepipeline',
    events: ['CreatePipeline'],
    permissions: ['codepipeline:TagResource'],
};

