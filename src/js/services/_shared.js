// Permissions for infrastructure/cross-cutting services not owned by a single service module
const SHARED_PERMISSIONS = [
    'tag:TagResources', 'tag:GetResources',
    'sns:Publish',
    'sqs:DeleteMessage', 'sqs:GetQueueAttributes', 'sqs:ReceiveMessage', 'sqs:SendMessage',
    'cloudwatch:TagResource', 'ssm:AddTagsToResource',
    'servicediscovery:TagResource',
    'cloudformation:TagResource', 'cloudformation:UpdateStack', 'cloudformation:UpdateStackSet',
    'cloudformation:DescribeStacks', 'cloudformation:ListStacks',
    'iam:TagRole',
    'autoscaling:CreateOrUpdateTags',
    'elasticbeanstalk:AddTags', 'emr-serverless:TagResource',
    'batch:TagResource',
    'globalaccelerator:TagResource',
    'appmesh:TagResource',
    'databrew:TagResource',
    'events:TagResource',
    'cloud9:TagResource',
    'braket:TagResource',
    'iotanalytics:TagResource', 'iotevents:TagResource', 'iotsitewise:TagResource',
    'workspaces-web:TagResource', 'connect:TagResource', 'managedblockchain:TagResource',
    'healthlake:TagResource', 'medical-imaging:TagResource',
];

// Events not tied to a specific source (infrastructure/cross-cutting)
const SHARED_EVENTS = [
    'PutMetricAlarm', 'PutParameter', 'PutRule', 'PutDashboard',
    'CreateAutoScalingGroup', 'CreateStack', 'CreateStackSet',
    'CreateOpsItem', 'CreateConfigurationProfile',
    'CreateDocument', 'CreateHttpNamespace',
    'CreateInstance', 'CreateTask', 'CreateMesh',
    'CreateComputeEnvironment', 'CreateAccelerator',
    'CreateDatastore',
];

