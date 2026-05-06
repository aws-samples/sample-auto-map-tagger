const SERVICE_WORKSPACES = {
    source: 'aws.workspaces',
    events: ['CreateWorkspaces'],
    permissions: ['workspaces:CreateTags'],
};

const SERVICE_WORKSPACES_INSTANCES = {
    source: 'aws.workspaces-instances',
    events: ['CreateWorkspaceInstance'],
    permissions: [],
};

