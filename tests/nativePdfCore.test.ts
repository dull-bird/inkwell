import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PDF4QT_HOST_ENV,
  resolveNativePdfCoreStatus,
  nativePdfCoreStatusSummary,
} from '../shared/native-pdf-core';

test('reports unavailable PDF4QT renderer when PDF4QT host is not configured', () => {
  const status = resolveNativePdfCoreStatus({ hostPath: undefined, hostExists: false });

  assert.equal(status.mode, 'pdf4qt-unavailable');
  assert.equal(status.renderer, 'unavailable');
  assert.equal(status.writeEngine, 'PyMuPDF');
  assert.equal(status.pdf4qt.available, false);
  assert.match(nativePdfCoreStatusSummary(status), /PDF4QT host not configured/);
});

test('reports PDF4QT available when native host path exists', () => {
  const status = resolveNativePdfCoreStatus({ hostPath: '/opt/inkwell/inkwell-pdf4qt-host', hostExists: true });

  assert.equal(status.mode, 'pdf4qt-ready');
  assert.equal(status.renderer, 'PDF4QT');
  assert.equal(status.writeEngine, 'PyMuPDF');
  assert.equal(status.pdf4qt.available, true);
  assert.equal(status.pdf4qt.envVar, PDF4QT_HOST_ENV);
  assert.match(nativePdfCoreStatusSummary(status), /PDF4QT native command bridge ready/);
  assert.match(nativePdfCoreStatusSummary(status), /Viewer: PDF4QT/);
  assert.match(nativePdfCoreStatusSummary(status), /Native core: PDF4QT/);
});

test('warns when PDF4QT host is configured but missing', () => {
  const status = resolveNativePdfCoreStatus({ hostPath: '/missing/host', hostExists: false });

  assert.equal(status.mode, 'pdf4qt-missing');
  assert.equal(status.pdf4qt.available, false);
  assert.match(nativePdfCoreStatusSummary(status), /configured but unavailable/);
});
