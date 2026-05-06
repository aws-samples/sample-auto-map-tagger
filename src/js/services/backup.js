const SERVICE_BACKUP = {
    source: 'aws.backup',
    events: ['CreateBackupVault', 'CreateBackupPlan'],
    permissions: ['backup:TagResource'],
};

