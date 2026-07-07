export type PdfFileAction = 'watermark' | 'encrypt' | 'signature' | 'fill-form';

export interface WatermarkRequestBody {
  path: string;
  text: string;
}

export interface EncryptRequestBody {
  path: string;
  user_pw: string;
  owner_pw: string;
}

export interface FillFormRequestBody {
  path: string;
  values: Record<string, string | number | boolean>;
}

export interface TypedSignatureRequestBody {
  path: string;
  page: number;
  x: number;
  y: number;
  text: string;
  signer: string;
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

export function buildFillFormRequest(path: string, jsonValues: string): FillFormRequestBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonValues);
  } catch {
    throw new Error('Form values must be a valid JSON object.');
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Form values must be a JSON object.');
  }
  const values: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new Error(`Form field "${key}" must be a string, number, or boolean.`);
    }
    values[key] = value;
  }
  return { path, values };
}

export function buildTypedSignatureRequest(
  path: string,
  page: number,
  x: number,
  y: number,
  text: string,
): TypedSignatureRequestBody {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Signature text cannot be empty.');
  return { path, page, x, y, text: trimmed, signer: trimmed };
}

export function describeFileOutput(action: PdfFileAction, outputPath: string): string {
  const name = fileName(outputPath);
  if (action === 'encrypt') {
    return `已加密输出 ${name}。加密文件不会自动打开，请用系统 PDF 阅读器验证密码。`;
  }
  if (action === 'signature') return `已签名并打开 ${name}`;
  if (action === 'fill-form') return `已填写表单并打开 ${name}`;
  return `已保存并打开 ${name}`;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
