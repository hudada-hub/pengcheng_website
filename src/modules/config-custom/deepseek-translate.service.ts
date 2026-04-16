import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from '../../entities/system-config.entity';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';

@Injectable()
export class DeepseekTranslateService {
  constructor(
    @InjectRepository(SystemConfig)
    private readonly systemConfigRepo: Repository<SystemConfig>,
  ) {}

  private async getApiKey(): Promise<string | null> {
    const row = await this.systemConfigRepo.findOne({
      where: { name: 'deepseek apikey' },
    });
    if (!row?.value?.trim()) return null;
    return row.value.trim();
  }

  async translateText(
    text: string,
    targetLangName: string,
    targetLangCode?: string,
  ): Promise<string> {
    if (!text?.trim()) return text || '';
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error(
        '未配置 DeepSeek API Key，请在系统配置中填写「deepseek apikey」',
      );
    }
    const langLabel = targetLangCode
      ? `${targetLangName}(${targetLangCode})`
      : targetLangName;
    const res = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `你是一名专业翻译。将用户给出的内容翻译成${langLabel}。只输出翻译结果，不要解释、不要加引号、不要换行。`,
          },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`DeepSeek API 错误: ${res.status} ${errText}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : text;
  }

  /**
   * 翻译富文本（HTML）。只翻译其中的可见文本，保持所有 HTML 标签和结构不变，输出为 HTML，不要转为 Markdown。
   */
  async translateHtml(
    html: string,
    targetLangName: string,
    targetLangCode?: string,
  ): Promise<string> {
    if (!html?.trim()) return html || '';
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error(
        '未配置 DeepSeek API Key，请在系统配置中填写「deepseek apikey」',
      );
    }
    const langLabel = targetLangCode
      ? `${targetLangName}(${targetLangCode})`
      : targetLangName;
    const res = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `你是一名专业翻译。用户将给出一段 HTML 富文本。请将其中的可见文本翻译成${langLabel}，保持所有 HTML 标签、属性、结构完全不变，只替换标签内的文字内容。直接输出翻译后的完整 HTML，不要转换为 Markdown，不要输出代码块包裹，不要解释。`,
          },
          { role: 'user', content: html },
        ],
        temperature: 0.2,
        max_tokens: 8192,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`DeepSeek API 错误: ${res.status} ${errText}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : html;
  }
}
