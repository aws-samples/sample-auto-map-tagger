import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('lambda-handler.py', () => {
  const py = fs.readFileSync(path.join(__dirname, '../../src/templates/lambda-handler.py'), 'utf8');

  it('starts with imports', () => {
    expect(py).toMatch(/^import /);
  });

  it('imports boto3', () => {
    expect(py).toContain('boto3');
  });

  it('has a lambda handler entry point', () => {
    // The handler processes SQS batch records
    expect(py).toContain('batchItemFailures');
  });

  it('contains tag_resource function', () => {
    expect(py).toContain('def tag_resource');
  });

  it('contains extract_arn function', () => {
    expect(py).toContain('def extract_arn');
  });
});

// Regression guards for the two product bugs live-confirmed in the
// 2026-07-14 release-gate run (P1-ECACHE-CL, P1-CW-DASH). Source-as-text
// assertions, matching the style of the checks above.
describe('lambda-handler.py — gate-confirmed regressions', () => {
  const py = fs.readFileSync(path.join(__dirname, '../../src/templates/lambda-handler.py'), 'utf8');

  it('classifies CacheClusterNotFoundFault as transient (P1-ECACHE-CL)', () => {
    // ElastiCache raises this while the cluster is still provisioning
    // ~30s after CreateCacheCluster; it must retry via SQS, not route
    // to permanent_actionable.
    const transientBlock = py.slice(
      py.indexOf('_TRANSIENT_MARKERS = ('),
      py.indexOf('_PERMANENT_IGNORABLE_MARKERS'));
    expect(transientBlock).toContain("'CacheClusterNotFoundFault'");
  });

  it('builds the CloudWatch dashboard ARN with an empty region segment (P1-CW-DASH)', () => {
    // Real dashboard ARNs are account-global: arn:aws:cloudwatch::{acct}:dashboard/{name}
    expect(py).toContain('return f"arn:aws:cloudwatch::{account_id}:dashboard/{dashboard_name}"');
    expect(py).not.toContain('arn:aws:cloudwatch:{region}:{account_id}:dashboard/');
  });
});
