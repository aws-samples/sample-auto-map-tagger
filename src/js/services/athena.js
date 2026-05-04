const SERVICE_ATHENA = {
    source: 'aws.athena',
    events: ['CreateWorkGroup'],
    permissions: ['athena:TagResource'],
};

