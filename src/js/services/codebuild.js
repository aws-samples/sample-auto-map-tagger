const SERVICE_CODEBUILD = {
    source: 'aws.codebuild',
    events: ['CreateProject'],
    permissions: ['codebuild:UpdateProject', 'codebuild:BatchGetProjects'],
};

