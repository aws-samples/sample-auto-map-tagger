const SERVICE_RDS = {
    source: 'aws.rds',
    events: [
        'CreateDBInstance', 'CreateDBCluster', 'CreateDBInstanceReadReplica',
        'CreateDBSnapshot', 'CreateDBClusterSnapshot',
        'CopyDBSnapshot', 'CopyDBClusterSnapshot',
        'RestoreDBInstanceFromDBSnapshot', 'RestoreDBInstanceToPointInTime',
        'RestoreDBClusterFromSnapshot', 'RestoreDBClusterToPointInTime',
        'CreateGlobalCluster', 'CreateDBProxy',
    ],
    permissions: ['rds:AddTagsToResource'],
};

