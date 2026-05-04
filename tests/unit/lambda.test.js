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
