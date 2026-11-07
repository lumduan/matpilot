/**
 * The prompt checklist (ADR 0015, "learning to prompt"): what makes a question easy for an AI to
 * answer well, checked in the page for free while the child types, before anything is sent. It
 * only gives advice; it never stops a question. Thai and English words are both understood.
 *
 * The checks are deliberately simple word matches: a tick means "this looks present", which is
 * enough to teach the habit.
 */
import type { AiMode } from './usage';

export interface CheckItem {
  readonly id: 'ask' | 'part' | 'expect' | 'answer';
  /** What a good prompt has. */
  readonly label: string;
  /** An example to copy the idea from. */
  readonly example: string;
  readonly ok: boolean;
}

const QUESTION =
  /\?|？|\b(what|why|how|when|where|which|does|do|is|can|could|should|explain|tell|check|find)\b|อะไร|ทำไม|อย่างไร|ยังไง|เมื่อไร|ตรงไหน|ไหม|มั้ย|หรือเปล่า|หรือไม่|อธิบาย|ช่วย|ดูให้|ตรวจ|หา/i;

const LINE = /\b(line|lines)\s*\d+|บรรทัด(ที่)?\s*\d+/i;

const PARTS =
  /\b(motor|motors|wheel|wheels|robot|turn|drive|straight|sensor|colou?r|distance|touch|light|display|screen|sound|beep|speaker|button|controller|xbox|loop|repeat|forever|if|else|wait|variable|function|define|tab|print|plot)\b|มอเตอร์|ล้อ|หุ่น|เลี้ยว|เดินหน้า|ถอยหลัง|เซนเซอร์|เซ็นเซอร์|สี|ระยะ|ไฟ|จอ|เสียง|ปุ่ม|จอย|วน|ซ้ำ|ถ้า|รอ|ตัวแปร|ฟังก์ชัน|แท็บ/i;

const EXPECT =
  /\b(want|wanted|expect|expected|should|supposed|instead|but|then it|it does|doesn't|does not|didn't|won't|never|always|stops?|keeps)\b|อยากให้|ต้องการ|ควรจะ|ควร|แต่|กลับ|ไม่ยอม|ไม่หยุด|ไม่ทำงาน|ไม่ขยับ|ไม่หมุน|หยุด|ค้าง/i;

const ANSWER_SHAPE =
  /\b(short|shortly|simple|simply|easy|step by step|steps|one by one|example|in thai|in english|for a kid|for kids|bullet|list|hint|hints)\b|สั้น|ง่าย|ทีละ|ขั้นตอน|ตัวอย่าง|ภาษาไทย|ภาษาอังกฤษ|สำหรับเด็ก|เป็นข้อ|คำใบ้|ใบ้/i;

/** Names in the program (functions, variables, devices), three letters or more. */
function programWords(code: string): Set<string> {
  const words = new Set<string>();
  for (const match of code.matchAll(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g)) {
    words.add(match[0].toLowerCase());
  }
  return words;
}

const COMMON = new Set(['the', 'and', 'for', 'not', 'are', 'this', 'that', 'you', 'can']);

/** The checklist for a question, in this mode, about this file's code. */
export function promptChecklist(question: string, mode: AiMode, code: string): CheckItem[] {
  const text = question.trim();
  const names = programWords(code);
  const mentionsName = (text.toLowerCase().match(/[a-z_][a-z0-9_]{2,}/g) ?? []).some(
    (word) => names.has(word) && !COMMON.has(word),
  );
  return [
    {
      id: 'ask',
      label: 'Ask one clear question',
      example: mode === 'explain' ? 'What does the repeat loop do?' : 'Why does my robot not stop?',
      ok: text.length >= 8 && QUESTION.test(text),
    },
    {
      id: 'part',
      label: 'Say which part: a block, a motor or sensor, or a line',
      example: 'the turn block in line 14',
      ok: LINE.test(text) || PARTS.test(text) || mentionsName,
    },
    {
      id: 'expect',
      label: 'Say what you want the robot to do, or what happens now',
      example: 'I want it to stop at the black line, but it keeps going',
      ok: EXPECT.test(text),
    },
    {
      id: 'answer',
      label: 'Say how to answer',
      example: 'Explain it step by step, with simple words',
      ok: ANSWER_SHAPE.test(text),
    },
  ];
}
