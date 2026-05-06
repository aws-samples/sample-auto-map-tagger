const SERVICE_REDSHIFT_SERVERLESS = {
    source: 'aws.redshift-serverless',
    events: ['CreateWorkgroup', 'CreateNamespace'],
    permissions: ['redshift-serverless:TagResource'],
};

