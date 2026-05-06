const SERVICE_DMS = {
    source: 'aws.dms',
    events: [
        'CreateReplicationInstance', 'CreateReplicationTask',
        'CreateReplicationConfig', 'CreateDataProvider', 'CreateMigrationProject',
    ],
    permissions: ['dms:AddTagsToResource'],
};

