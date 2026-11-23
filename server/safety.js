// Text safety screening for comments, captions and messages.
// This is a first, deterministic layer. Production must add a maintained
// hate-speech lexicon (loaded from MAKA_LEXICON_FILE, managed by Trust & Safety,
// never hard-coded) and an ML classifier, with human review behind both.
import fs from 'node:fs';

const leet = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
export function normalize(text) {
  return String(text).toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[013457@$!]/g, (c) => leet[c])
    .replace(/(.)\1{2,}/g, '$1$1')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const THREATS = [
  /\bkill (yo)?u?r ?self\b/, /\bkys\b/, /\bgo die\b/, /\bi (will|ll|am going to|m gonna|m going to) (find|hurt|kill|beat|end) you\b/,
  /\bi know where you (live|work|sleep)\b/, /\byou (should|deserve to) (die|be killed|be hurt)\b/, /\bhope you die\b/,
];
// Insults aimed at a person ("you're worthless") are held; criticism of work
// ("the editing here felt rushed") is not.
const DIRECTED_INSULT = /\b(you|u|youre|you re|ur|she|he|they) (are|is|re|r)? ?(an? )?(so |such an? |really )?(idiot|stupid|ugly|worthless|loser|pathetic|disgusting|trash|garbage|fat|dumb|moron|freak)\b/;
const DOXX = [
  /\b\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln)\b/i,
  /\b(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/,
];

let lexicon = [];
export function loadLexicon(file) {
  if (!file) return;
  try {
    lexicon = fs.readFileSync(file, 'utf8').split('\n').map((s) => normalize(s)).filter(Boolean);
  } catch { lexicon = []; }
}

/** @returns {{action:'allow'|'hold', reasons:string[]}} */
export function screenText(text, { personalFilter = [] } = {}) {
  const raw = String(text);
  const n = normalize(raw);
  const reasons = [];
  if (THREATS.some((r) => r.test(n))) reasons.push('threat_or_self_harm_encouragement');
  if (DIRECTED_INSULT.test(n)) reasons.push('directed_insult');
  if (DOXX.some((r) => r.test(raw))) reasons.push('possible_personal_information');
  if (lexicon.some((w) => (' ' + n + ' ').includes(' ' + w + ' '))) reasons.push('hate_lexicon');
  const pf = personalFilter.map(normalize).filter(Boolean);
  if (pf.some((w) => (' ' + n + ' ').includes(' ' + w + ' '))) reasons.push('creator_keyword_filter');
  return { action: reasons.length ? 'hold' : 'allow', reasons };
}

export const REPORT_REASONS = {
  bullying: 'Bullying or harassment',
  hate: 'Racism or discriminatory abuse',
  threat: 'Threats or violence',
  doxxing: 'Sharing private information',
  ridicule_remix: 'Stitch/remix made to ridicule someone',
  coordinated: 'Coordinated harassment / pile-on',
  sexual: 'Sexual content or exploitation',
  underage: 'User may be under 19',
  spam: 'Spam, scams or fake engagement',
  ip: 'Copyright or unlicensed content',
  other: 'Something else',
};
// Higher priority reaches human reviewers first.
export const REPORT_PRIORITY = { threat: 5, underage: 5, sexual: 5, doxxing: 4, hate: 4, coordinated: 4, bullying: 3, ridicule_remix: 3, ip: 2, spam: 1, other: 1 };
