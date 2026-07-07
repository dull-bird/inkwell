export type PdfFileAction = 'watermark' | 'encrypt';

export interface WatermarkRequestBody {
  path: string;
  text: string;
}

export interface EncryptRequestBody {
  path: string;
  user_pw: string;
  owner_pw: string;
}

export function buildWatermarkRequest(path: string, text: string): WatermarkRequestBody {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Watermark text cannot be empty.');
  return { path, text: trimmed };
}

export function buildEncryptRequest(path: string, password: string): EncryptRequestBody {
  const trimmed = password.trim();
  if (!trimmed) throw new Error('Password cannot be empty.');
  return { path, user_pw: trimmed, owner_pw: trimmed };
}

export function describeFileOutput(action: PdfFileAction, outputPath: string): string {
  const name = fileName(outputPath);
  if (action === 'encrypt') {
    return `已加密输出 ${name}。加密文件不会自动打开，请用系统 PDF 阅读器验证密码。`;
  }
  return `已保存并打开 ${name}`;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
