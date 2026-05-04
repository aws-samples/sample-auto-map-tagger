const SERVICE_EFS = {
    source: 'aws.elasticfilesystem',
    events: ['CreateFileSystem'],
    permissions: ['elasticfilesystem:TagResource'],
};

