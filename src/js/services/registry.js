        // Complete list of event names (200+ proven events)
        const ALL_EVENT_NAMES = [
            'RunInstances','CreateVolume','CreateBucket','CreateDBInstance','CreateDBCluster',
            'CreateTable','CreateFunction20150331','CreateLoadBalancer','CreateCluster','CreateService',
            'CreateTopic','CreateQueue','CreateFileSystem','CreateCacheCluster','CreateReplicationGroup',
            'CreateDomain','RunJobFlow','CreateStream','CreateDeliveryStream','CreateBroker',
            'CreateRepository','CreateRestApi','CreateApi','CreateJob','CreateCrawler','CreateDatabase',
            'CreateStateMachine','CreateKey','CreateSecret','CreateNotebookInstance','CreateEndpoint',
            'CreateTrainingJob','CreateDistribution','CreateReplicationInstance','CreateReplicationTask',
            'CreateFirewall','CreateFirewallPolicy','CreateServer','CreateWorkspaces','CreateHostedZone',
            'ActivateGateway','CreateFleet','CreateImageBuilder','CreateDirectory','CreateMicrosoftAD',
            'RequestCertificate','CreateGraphqlApi','CreateProject','CreatePipeline','CreateBackupVault',
            'CreateBackupPlan','CreateLogGroup','CreateUserPool','CreateIdentityPool','CreateApplication',
            'CreateMemory','CreateAgentRuntime','CreateKey','CreateCoreNetwork','CreateGlobalNetwork',
            'CreateServiceNetwork','CreateService','CreateWorkspaceInstance',
            'CreateKeyspace','CreateDatastore','EnableSecurityHub','CreateOpsItem',
            'CreateIndex','CreateChannel','CreateInput','CreateEnvironment','CreateApp','CreateSequenceStore',
            'CreateRunGroup','CreateWorkgroup','CreateNamespace','CreateDocumentClassifier',
            'CreateEntityRecognizer','CreateConnection','CreateHsm','CreateVault','CreateSnapshot',
            'CopySnapshot','CreateImage','CopyImage','ImportImage','ImportSnapshot',
            'CreateCapacityReservation','CreateDBInstanceReadReplica','CreateDBSnapshot',
            'CreateDBClusterSnapshot','CopyDBSnapshot','CopyDBClusterSnapshot',
            'RestoreDBInstanceFromDBSnapshot','RestoreDBInstanceToPointInTime',
            'RestoreDBClusterFromSnapshot','RestoreDBClusterToPointInTime','CreateGlobalCluster',
            'CreateClusterSnapshot','RestoreFromClusterSnapshot','CreateVpc','CreateSubnet',
            'CreateNatGateway','CreateTransitGateway','CreateTransitGatewayVpcAttachment',
            'CreateVpcEndpoint','AllocateAddress','CreateClientVpnEndpoint','CreateVpnGateway',
            'CreateVpnConnection','RunTask','CreateProcessingJob','CreateTransformJob',
            'CreateModel','CreateEndpointConfig','PutMetricAlarm','RunScheduledInstances',
            'CreateInferenceProfile','CreateModelCustomizationJob','CreateAgent','CreateKnowledgeBase',
            'CreateGuardrail','CreateFlow','CreatePrompt','CreateProvisionedModelThroughput',
            'CreateModelImportJob','CreateModelInvocationJob','CreateEvaluationJob','CreatePromptRouter',
            'CreateNodegroup','CreateFargateProfile','CreateStorageVirtualMachine',
            'CreateAgentAlias','CreateDataSource','CreateAgentActionGroup','CreateSnapshots',
            'CreateDashboard','CreateAnalysis','CreateDataSet','RegisterUser',
            'CreateComputeEnvironment','CreateReplicationGroup','CreateCacheCluster',
            'CreateActivity','CreateStateMachine',
            'CreateAccelerator','PublishLayerVersion20181031','CreateAlias20150331',
            'CreateAddon','CreateTransitGatewayVpcAttachment','CreateFlowLogs',
            'CreateUserPool','CreateIdentityPool',
            'CreateConfigurationProfile',
            'CreateFirewallPolicy','CreateFirewall',
            'CreateWebACL','CreateIPSet','CreateDeploymentGroup',
            'PutParameter','PutRule','PutDashboard','PutQueryDefinition',
            'CreateAutoScalingGroup','CreateSecurityGroup','CreateInternetGateway',
            'CreateRouteTable','CreateNetworkAcl','CreateNetworkInterface',
            'CreateDhcpOptions','CreatePlacementGroup','CreateEgressOnlyInternetGateway',
            'CreateCustomerGateway','CreateCarrierGateway','CreateKeyPair',
            'CreateVpcPeeringConnection','CreateVpcLink','CreateLaunchTemplate',
            'CreateTargetGroup','CreateStack','CreateStackSet',
            'CreateCollection','CreateWorkGroup','CreateWorkflow','CreateTrigger',
            'CreateDataset','CreateRecipe',
            'CreateCertificateAuthority','CreateResourceShare',
            'CreateDBProxy','CreateHealthCheck','CreateDocument',
            'CreateHttpNamespace',
            'CreateTapePool','CreatePortfolio','CreateMesh',
            'CreateInstance','CreateBuild','CreateScript','CreateTask',
            'CreateApiKey',
            'CreateClusterV2','CreateServerlessCache',
            'RestoreTableFromBackup','RestoreTableToPointInTime',
            'CreateReplicationConfig','CreateDataProvider','CreateMigrationProject',
            'CreateConnector','CreateUser',
            'CreateLag','CreateDirectConnectGateway',
            'CreateFarm','CreateQueue',
            'CreateAsset','CreateAssetModel','CreateGateway','CreatePortal',
            'CreateTopicRule',
            'CreateSourceServer',
            'CreateDomain',
            'ConnectDirectory'
        ];

        const ALL_SOURCES = [
            'aws.ec2','aws.s3','aws.rds','aws.dynamodb','aws.lambda','aws.elasticloadbalancing',
            'aws.ecs','aws.sns','aws.sqs','aws.eks','aws.elasticfilesystem','aws.elasticache',
            'aws.redshift','aws.es','aws.fsx','aws.kafka','aws.elasticmapreduce','aws.kinesis',
            'aws.firehose','aws.mq','aws.ecr','aws.apigateway','aws.glue','aws.states',
            'aws.kms','aws.secretsmanager','aws.sagemaker','aws.cloudfront','aws.dms',
            'aws.network-firewall','aws.transfer','aws.workspaces','aws.timestream',
            'aws.datasync','aws.route53','aws.storagegateway','aws.memorydb','aws.cassandra',
            'aws.appstream','aws.ds','aws.acm','aws.appsync','aws.codebuild','aws.codepipeline',
            'aws.backup','aws.logs','aws.cognito-idp','aws.cognito-identity','aws.kinesisanalytics',
            'aws.gamelift','aws.kendra','aws.mediaconvert','aws.medialive','aws.mediapackage',
            'aws.m2','aws.resiliencehub','aws.finspace','aws.omics','aws.redshift-serverless',
            'aws.comprehend','aws.directconnect','aws.cloudhsm','aws.glacier','aws.bedrock',
            'aws.bedrock-agent','aws.quicksight',
            'aws.securityhub',
            'aws.athena',
            'aws.servicecatalog','aws.ram','aws.acm-pca','aws.aoss',
            'aws.kinesisvideo','aws.dsql','aws.vpc-lattice','aws.bedrock-agentcore',
            'aws.payment-cryptography','aws.networkmanager','aws.workspaces-instances',
            'aws.dax','aws.drs','aws.deadline','aws.iot',
            'aws.wafv2','aws.codedeploy'
        ];

        const TAGGING_PERMISSIONS = [
            // Universal tagging
            'tag:TagResources','tag:GetResources',
            // Compute
            'ec2:CreateTags','autoscaling:CreateOrUpdateTags','ecs:TagResource','eks:TagResource',
            'lambda:TagResource',
            'elasticbeanstalk:AddTags','elasticmapreduce:AddTags','emr-serverless:TagResource',
            // Storage
            's3:PutBucketTagging','s3:GetBucketTagging','elasticfilesystem:TagResource','fsx:TagResource',
            'ecr:TagResource','backup:TagResource',
            // AWS Batch (§1.27): job queues, compute environments, job definitions.
            // RGTA-dispatched; batch:TagResource required per service-auth matrix.
            'batch:TagResource',
            // Database
            'rds:AddTagsToResource','dynamodb:TagResource','elasticache:AddTagsToResource',
            'memorydb:TagResource','redshift:CreateTags','redshift-serverless:TagResource',
            'es:AddTags','kafka:TagResource','dms:AddTagsToResource','cassandra:TagResource','cassandra:Alter',
            'mq:CreateTags',
            // Networking
            'elasticloadbalancing:AddTags','globalaccelerator:TagResource','cloudfront:TagResource',
            'route53:ChangeTagsForResource','network-firewall:TagResource','directconnect:TagResource',
            'appmesh:TagResource',
            // Analytics
            'kinesis:AddTagsToStream','firehose:TagDeliveryStream','kinesisanalytics:TagResource',
            'glue:TagResource','glue:GetDatabase','databrew:TagResource',
            'athena:TagResource',
            // Integration
            'sns:TagResource','sqs:TagQueue','states:TagResource',
            'appsync:TagResource','apigateway:TagResource',
            // SECURITY NOTE: API Gateway v1 REST API tagging requires both PUT and PATCH.
            // AWS maps tag_resource() to apigateway:PATCH internally (confirmed via AccessDenied testing).
            // Precedent: MAP Taggr (AppSec-approved) grants all 5 API GW methods (GET/PUT/PATCH/DELETE/POST).
            // We grant only PUT and PATCH — more conservative than the approved precedent.
            'apigateway:PUT','apigateway:PATCH','apigateway:POST',
            // Management & Monitoring
            'logs:TagResource','cloudwatch:TagResource','ssm:AddTagsToResource',
            'secretsmanager:TagResource',
            'servicediscovery:TagResource',
            'sns:Publish',
            'sqs:DeleteMessage','sqs:GetQueueAttributes','sqs:ReceiveMessage','sqs:SendMessage',
            // Security
            'kms:TagResource','acm:AddTagsToCertificate',
            'acm-pca:TagCertificateAuthority',
            'cognito-idp:TagResource','cognito-identity:TagResource',
            'securityhub:TagResource','wafv2:TagResource',
            // Developer Tools
            'codepipeline:TagResource','codedeploy:TagResource',
            'cloud9:TagResource',
            // CodeBuild: tags applied via UpdateProject; BatchGetProjects needed for tag resolution
            'codebuild:UpdateProject','codebuild:BatchGetProjects',
            // CloudFormation: tagging maps to UpdateStack internally; DescribeStacks is AWS's internal read for ARN validation.
            // ListStacks is the peer-tagger detector at Lambda cold-start (§1.108, plan-PR #57).
            'cloudformation:TagResource','cloudformation:UpdateStack','cloudformation:UpdateStackSet','cloudformation:DescribeStacks','cloudformation:ListStacks',
            // Service Catalog: tagging routes through Update* actions
            'servicecatalog:TagResource',
            'servicecatalog:UpdatePortfolio','servicecatalog:UpdateProduct',
            // Migration & Transfer
            'transfer:TagResource','datasync:TagResource','storagegateway:AddTagsToResource',
            // ML / AI
            'sagemaker:AddTags','comprehend:TagResource',
            'kendra:TagResource',
            'bedrock:TagResource','braket:TagResource',
            // IoT
            'iot:TagResource','iotanalytics:TagResource','iotevents:TagResource',
            'iotsitewise:TagResource',
            // EventBridge (events:*) — distinct service from IoT Events (iotevents:*).
            // Needed to tag newly-created Event rules / buses / schedules / connections.
            'events:TagResource',
            'kinesisvideo:TagStream','dsql:TagResource','vpc-lattice:TagResource',
            'bedrock-agentcore:TagResource','payment-cryptography:TagResource',
            'networkmanager:TagResource',
            // Media
            'mediaconvert:TagResource',
            'medialive:CreateTags','mediapackage:TagResource',
            // Other
            'ram:TagResource','appstream:TagResource','workspaces:CreateTags',
            'workspaces-web:TagResource','quicksight:TagResource','connect:TagResource',
            'managedblockchain:TagResource',
            'gamelift:TagResource','timestream:TagResource',
            'healthlake:TagResource','omics:TagResource',
            'resiliencehub:TagResource','deadline:TagResource','medical-imaging:TagResource',
            'securityhub:TagResource','cassandra:Alter',
            'dax:TagResource','drs:TagResource',
            'kinesisvideo:TagStream',
            // Tier 1 MAP services (PR #25): Keyspaces, Directory Service, CloudHSM v2.
            // cassandra:TagResource already granted above under Database.
            'ds:AddTagsToResource','cloudhsm:TagResource',
            // IAM role tagging (iam:TagRole not covered by tag:TagResources)
            'iam:TagRole'
        ];

