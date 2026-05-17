import type { ChatMessage } from '../types';

export interface BuildRejectionCheckMessagesInput {
  bidContent: string;
  tenderContent?: string;
}

export function buildRejectionCheckMessages({ bidContent, tenderContent }: BuildRejectionCheckMessagesInput): ChatMessage[] {
  const systemPrompt = `你是一名投标文件废标项检查专家。请严格基于用户提供的标书正文和招标要求，逐项核查是否存在可能导致废标的风险。

核查维度：
1. 投标人资格条件 — 是否满足招标文件对资质、业绩、人员等的要求
2. 签字盖章要求 — 签字、盖章、授权委托等是否完整规范
3. 工期与交付承诺 — 是否明确响应工期、交付物和进度要求
4. 技术参数响应 — 是否实质性响应技术参数，有无负偏离或未响应项
5. 商务条款偏离 — 报价、付款、质保等商务条款是否存在重大偏离
6. 其他风险 — 投标有效期、保证金、联合体要求、分包限制等

输出要求：
1. 每项风险必须明确说明来源（原文中的具体条款或章节）
2. 每项风险必须给出具体的修改建议
3. 严重程度按实际影响判定：high（必然废标）、medium（高风险需修改）、low（建议优化）
4. 如果经检查没有发现任何风险，passed 为 true，risks 为空数组
5. 只输出 JSON，不要输出任何解释文字

JSON 格式：
{
  "passed": true,
  "risks": [
    {
      "id": "risk-001",
      "title": "风险简要标题",
      "source": "来源条款或章节",
      "suggestion": "修改或补充建议",
      "severity": "high"
    }
  ]
}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `以下是我的投标文件正文，请检查废标风险：\n\n${bidContent}` },
  ];

  if (tenderContent) {
    messages.push({
      role: 'user',
      content: `以下是招标文件相关要求，用于对照检查：\n\n${tenderContent}`,
    });
  }

  messages.push({
    role: 'user',
    content: '请基于以上标书内容对废标风险做出全面检查，严格按照 JSON 格式输出结果。如果没有发现风险，passed 为 true。',
  });

  return messages;
}
