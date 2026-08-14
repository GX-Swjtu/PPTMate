#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatesRoot = path.join(repoRoot, "templates");
const checkOnly = process.argv.includes("--check");

const TEMPLATE_METADATA = {
  dynamic: {
    name: "动感",
    description: "高对比深色纹理搭配暖色点缀，适合具有视觉冲击力和叙事感的演示。",
  },
  editorial: {
    name: "臻选",
    description: "精致的编辑式版面结合衬线标题与清晰正文，适合报告、观点表达和故事化演示。",
  },
  executive: {
    name: "睿策",
    description: "醒目标题、清晰结构与淡紫色点缀，适合战略决策和管理层汇报。",
  },
  general: {
    name: "通用",
    description: "简洁留白与清晰排版兼顾，适合日常汇报和通用演示。",
  },
  modern: {
    name: "现代",
    description: "现代简洁的版面、充足留白与鲜明视觉重点，适合专业演示。",
  },
  momentum: {
    name: "势能",
    description: "动感曲线、醒目标题与丰富数据表达，适合战略、业绩、产品和领导力演示。",
  },
  standard: {
    name: "标准",
    description: "均衡灵活的版面让商务和日常内容保持清晰、有序、易读。",
  },
  swift: {
    name: "迅捷",
    description: "明快配色与紧凑结构营造流畅节奏，适合简洁有力的演示。",
  },
};

const HAN_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/u;
const CJK_FONT_FAMILIES = new Set(["Noto Sans CJK SC", "Noto Serif CJK SC"]);
const SERIF_FONT_PATTERN =
  /serif|playfair|merriweather|bodoni|georgia|times|lora|cormorant|baskerville|garamond/i;

const EXACT_TRANSLATIONS = new Map(
  Object.entries({
    "introduction": "项目简介",
    "agenda": "目录",
    "table of contents": "目录",
    "table of contents.": "目录",
    "executive summary": "执行摘要",
    "executive summary.": "执行摘要",
    "about the company": "关于我们",
    "our company": "关于我们",
    "our team": "我们的团队",
    "our team members": "团队成员",
    "meet ourteam": "认识团队",
    "meet our team": "认识团队",
    "meet our team.": "认识团队",
    "meet the team": "团队介绍",
    "our professional team": "专业团队",
    "leadership team": "管理团队",
    "problem": "问题",
    "problems": "问题与挑战",
    "problem statement": "问题陈述",
    "problems statement": "问题陈述",
    "solution": "解决方案",
    "solutions": "解决方案",
    "our solution": "我们的方案",
    "our approaches": "实施路径",
    "our approach": "实施路径",
    "strategy": "战略",
    "strategic action plan": "战略行动计划",
    "esg strategy": "ESG 战略",
    "strategic sustainability initiatives": "可持续发展战略举措",
    "esg value creation framework": "ESG 价值创造框架",
    "esg report highlights": "ESG 报告要点",
    "esg performance": "ESG 绩效",
    "annual report 2026": "2026 年度报告",
    "environmental performance": "环境绩效",
    "esg challenges": "ESG 挑战",
    "key esg metrics": "ESG 核心指标",
    "planet health": "地球健康",
    "climate": "气候",
    "nature": "自然",
    "people": "人才",
    "carbon emissions reduction journey": "碳减排历程",
    "overall esg score": "ESG 综合评分",
    "esg investment by pillar": "ESG 分领域投入",
    "environment": "环境",
    "social": "社会",
    "governance": "治理",
    "environmental challenges": "环境挑战",
    "social challenges": "社会挑战",
    "governance challenges": "治理挑战",
    "reduce environmental impact": "降低环境影响",
    "empower people & communities": "赋能员工与社区",
    "strengthen governance": "强化公司治理",
    "reduce carbon emissions": "减少碳排放",
    "promote clean energy": "推广清洁能源",
    "protect natural resources": "保护自然资源",
    "renewable energy": "可再生能源",
    "carbon emissions": "碳排放",
    "global temperature rise": "全球气温上升",
    "employee engagement": "员工敬业度",
    "strong governance": "稳健治理",
    "social responsibility": "社会责任",
    "long-term value": "长期价值",
    "assessment & planning": "评估与规划",
    "implementation": "落地实施",
    "improvement": "持续改进",
    "esg assessment": "ESG 评估",
    "strategy development": "战略制定",
    "innovate": "创新",
    "reduce": "减量",
    "protect": "保护",
    "product overview": "产品概览",
    "pitch deck": "商业计划书",
    "pitch deck team": "项目团队",
    "market validation": "市场验证",
    "market demand": "市场需求",
    "market": "市场",
    "industry": "行业",
    "market growth": "市场增长",
    "market inflection point": "市场拐点",
    "data table or chart": "数据表或图表",
    "insights at a glance": "关键洞察",
    "proven results through data": "用数据验证成果",
    "business expansion across the country": "全国业务拓展",
    "business reports and executive": "经营分析与管理汇报",
    "a blueprint for success": "成功蓝图",
    "transforming ideas into": "让创意成为",
    "reality": "现实",
    "sales report": "销售报告",
    "sales journey": "销售增长之路",
    "sales growth framework": "销售增长框架",
    "revenue by product category": "各产品类别营收",
    "customer acquisition": "客户获取",
    "customer retention": "客户留存",
    "online purchase preference": "线上购买偏好",
    "online sales growth": "线上销售增长",
    "smart task management platform": "智能任务管理平台",
    "smart task management": "智能任务管理",
    "what is a": "什么是",
    "platform ?": "平台？",
    "productivity growth analysis": "生产力增长分析",
    "performance trend": "绩效趋势",
    "next steps": "后续行动",
    "the process": "实施流程",
    "project setup": "项目启动",
    "requirement analysis": "需求分析",
    "user management": "用户管理",
    "increase efficiency": "提升效率",
    "reduce manual work": "减少手工操作",
    "improve collaboration": "改善协作",
    "communication": "沟通协同",
    "digital learning platform": "数字学习平台",
    "custom software": "定制软件",
    "digital consulting": "数字化咨询",
    "support services": "支持服务",
    "scalable marketing": "规模化营销",
    "inefficiency": "效率不足",
    "high costs": "成本高企",
    "customizable workflows": "可配置工作流",
    "multi-device access": "多终端访问",
    "scalable architecture": "可扩展架构",
    "detailed reports": "精细化报表",
    "key product features": "产品核心功能",
    "image with description": "图文说明",
    "our infographic": "信息图概览",
    "infographic flow": "信息图流程",
    "heading bar graph": "关键指标柱状图",
    "heading metrics": "核心指标",
    "ascending kpi": "KPI 增长趋势",
    "office expansion": "办公网络拓展",
    "what comes next?": "下一步行动",
    "heading for solution": "解决方案概览",
    "your heading comparison": "方案对比",
    "traditional vs smart platform": "传统方式与智能平台",
    "comparison between": "对比分析",
    "total users": "用户总数",
    "revenue growth": "营收增长",
    "customer satisfaction": "客户满意度",
    "active users across multiple industries": "覆盖多个行业的活跃用户",
    "year-over-year revenue growth": "营收同比增长",
    "retention rate with an average rating of 4.8/5": "客户留存率，平均评分 4.8/5",
    "internet of things": "物联网平台",
    "mobile app suite": "移动应用套件",
    "analytics dashboard": "数据分析看板",
    "smart home platform": "智能家居平台",
    "free": "免费版",
    "standard": "标准版",
    "professional": "专业版",
    "enterprise": "企业版",
    "features:": "功能：",
    "presented by": "汇报人",
    "presenter:": "汇报人：",
    "date": "日期",
    "date:": "日期：",
    "page": "页码",
    "page ": "页码 ",
    "name": "姓名",
    "your name": "姓名",
    "designation": "职务",
    "chief executive officer": "首席执行官",
    "ceo": "首席执行官",
    "project manager": "项目经理",
    "student": "学员",
    "james": "李明",
    "john doe": "张明",
    "emman johnson": "陈晨",
    "lorem doe, ceo": "王强，首席执行官",
    "winston churchill": "行业箴言",
    "william clement stone": "行业箴言",
    "december 2025": "2025 年 12 月",
    "22 december 2030": "2030 年 12 月 22 日",
    "december 22, 2025": "2025 年 12 月 22 日",
    "jan 1, 2025": "2025 年 1 月 1 日",
    "jan 26, 2030": "2030 年 1 月 26 日",
    "address": "地址",
    "phone": "电话",
    "e-mail:": "邮箱：",
    "boston, downtown main street 233, new york, us": "北京市朝阳区示例路 233 号",
    "mail@company.com": "联系邮箱",
    "www.yourwebsite.com": "品牌官网",
    "jd": "张",
    "pdt": "团队",
    "heading": "核心要点",
    "sample title": "示例主题",
    "another item": "重点事项",
    "third item": "实施成果",
    "your topic": "主题要点",
    "topic": "主题",
    "total": "合计",
    "percent": "占比",
    "company": "公司",
    "company a": "企业甲",
    "company b": "企业乙",
    "company c": "企业丙",
    "revenue": "营收",
    "growth": "增长",
    "metric": "指标",
    "value": "数值",
    "values": "数值",
    "users": "用户数",
    "customers": "客户数",
    "conversion rate": "转化率",
    "market share": "市场份额",
    "retention": "留存率",
    "satisfaction": "满意度",
    "last year": "去年",
    "this year": "今年",
    "column 1": "第一列",
    "column 2": "第二列",
    "column 3": "第三列",
    "row a": "甲项",
    "row b": "乙项",
    "row c": "丙项",
    "text": "说明",
    "more text": "补充说明",
    "accessories": "配件",
    "services": "服务",
    "electronics": "电子产品",
    "software": "软件",
    "desktop": "桌面端",
    "mobile": "移动端",
    "operation": "运营",
    "l&d": "学习与发展",
    "hr": "人力资源",
    "sales": "销售",
    "finance": "财务",
    "marketing": "市场营销",
    "january": "1 月",
    "february": "2 月",
    "march": "3 月",
    "april": "4 月",
    "may": "5 月",
    "june": "6 月",
    "july": "7 月",
    "august": "8 月",
    "september": "9 月",
    "october": "10 月",
    "november": "11 月",
    "december": "12 月",
    "jan": "1 月",
    "feb": "2 月",
    "mar": "3 月",
    "apr": "4 月",
    "jun": "6 月",
    "jul": "7 月",
    "aug": "8 月",
    "sep": "9 月",
    "oct": "10 月",
    "nov": "11 月",
    "dec": "12 月",
    "winter": "冬季",
    "spring": "春季",
    "summer": "夏季",
    "fall": "秋季",
    "series": "数据系列",
    "series 1": "数据系列",
    "trend_series": "变化趋势",
    "current performance": "当前表现",
    "carbon reduction": "碳减排",
    "esg score": "ESG 评分",
    "environmental": "环境",
    "innovation": "创新",
    "investment by pillar": "分领域投入",
    "waste recycled": "废弃物回收",
    "distribution": "构成占比",
    "baseline": "基准值",
    "energy efficiency": "能效提升",
    "carbon offsetting": "碳抵消",
    "net emission": "净排放",
    "share": "占比",
    "tasks": "完成任务数",
    "comparison values": "对比数据",
    "artificial intelligence": "人工智能",
    "other technology": "其他技术",
    "digital marketing": "数字营销",
    "direct sales": "直销",
    "referrals": "客户推荐",
    "retail stores": "零售门店",
    "acquisition share": "获客占比",
    "global temperature increase": "全球气温升幅",
    "atmospheric co₂ (ppm)": "大气 CO₂ 浓度（ppm）",
    "gtco₂": "排放量（GtCO₂）",
    "a": "甲项",
    "b": "乙项",
    "c": "丙项",
    "d": "丁项",
    "phase 1": "第一阶段",
    "phase 2": "第二阶段",
    "phase 3": "第三阶段",
    "phase 4": "第四阶段",
    "phase 1:": "第一阶段：",
    "0–6 month": "0—6 个月",
    "6–12 months": "6—12 个月",
    "12–18 months": "12—18 个月",
    "visionary leadership": "前瞻领导力",
    "innovation at the core": "以创新为核心",
    "customer-centric disruption": "以客户为中心的变革",
    "payroll": "薪酬管理",
    "new text": "新文本",
  }).map(([source, target]) => [source.toLowerCase(), target]),
);

const TITLE_POOLS = {
  sustainability: ["可持续发展目标", "绿色转型路径", "ESG 关键进展", "环境与社会价值", "面向未来的责任行动"],
  productivity: ["智能协作新方式", "任务管理核心能力", "高效执行路径", "项目协作全景", "团队生产力提升"],
  sales: ["销售业绩概览", "市场增长机会", "客户经营策略", "营收增长路径", "业务成果与展望"],
  education: ["数字学习新体验", "教学服务升级", "学习平台核心价值", "智慧教育实施路径", "学习成果概览"],
  people: ["人才发展战略", "高绩效团队建设", "组织能力升级", "团队与领导力", "人才结构洞察"],
  digital: ["数字化解决方案", "产品能力全景", "技术驱动增长", "平台核心优势", "创新产品路线图"],
  strategy: ["战略重点概览", "业务发展蓝图", "关键举措与成果", "增长路径分析", "下一阶段规划"],
};

const BODY_POOLS = {
  sustainability: [
    "围绕节能降碳、资源效率和责任治理持续行动，以可衡量成果推动长期价值增长。",
    "通过明确目标、重点项目和透明披露，把可持续发展融入日常经营与战略决策。",
    "聚焦环境、员工与治理三大领域，系统识别风险并持续改善关键绩效。",
  ],
  productivity: [
    "通过统一任务、进度和协作信息，减少重复操作，让团队更快完成高质量交付。",
    "平台支持任务分配、优先级管理、进度跟踪和实时协作，帮助团队保持目标一致。",
    "用自动化与清晰流程连接人员和工作，及时发现风险并提升项目执行效率。",
  ],
  sales: [
    "通过精细化客户运营、渠道优化和数据分析，持续提升线索转化与销售产出。",
    "经营数据保持稳健增长，客户覆盖与复购表现进一步改善，为后续扩张奠定基础。",
    "聚焦高价值市场和重点客户，以更高效的销售流程推动营收与市场份额增长。",
  ],
  education: [
    "平台打通课程、学习进度与互动反馈，为师生提供安全、便捷且可持续的数字学习体验。",
    "通过在线资源、个性化学习和数据洞察，提升教学可及性与学习效果。",
    "统一的数字学习服务简化教学管理，让优质内容能够覆盖更多学习者。",
  ],
  people: [
    "以清晰目标、持续反馈和能力培养激发团队潜力，建设更具韧性的组织。",
    "完善人才发展与协作机制，让不同岗位围绕共同目标高效配合并持续成长。",
    "通过多元人才、开放沟通和有效激励，提升员工体验与组织执行力。",
  ],
  digital: [
    "以灵活架构、统一数据和智能能力支撑业务创新，帮助组织快速响应不断变化的需求。",
    "产品整合核心流程与实时洞察，降低使用门槛并提升运营效率和决策质量。",
    "通过可扩展技术与良好体验连接业务场景，为持续增长提供可靠支撑。",
  ],
  strategy: [
    "围绕核心目标明确优先级、责任人与实施节奏，以阶段性成果推动战略落地。",
    "基于市场洞察和经营数据识别关键机会，集中资源推进高价值行动。",
    "通过清晰规划、协同执行和持续复盘，把战略方向转化为可衡量的业务成果。",
  ],
};

const LABEL_POOLS = ["核心能力", "重点举措", "关键成果", "业务价值", "实施建议", "阶段目标"];

function stableIndex(value, length) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

function pick(pool, seed) {
  return pool[stableIndex(seed, pool.length)];
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function hasHan(value) {
  return /[\u3400-\u9fff]/u.test(value);
}

function hasLatin(value) {
  return /[A-Za-z]/.test(value);
}

function detectTheme(source, templateId) {
  const text = source.toLowerCase();
  if (/esg|sustain|environment|carbon|emission|climate|energy|planet|governance|green/.test(text)) return "sustainability";
  if (/task|project|workflow|productivity|collaborat|work management|reminder/.test(text)) return "productivity";
  if (/learn|student|course|education|university|teaching/.test(text)) return "education";
  if (/sales|revenue|customer|market|lead|purchase|product category/.test(text)) return "sales";
  if (/employee|talent|team|people|leadership|human resource|\bhr\b/.test(text)) return "people";
  if (/digital|software|technology|platform|product|data|analytics|mobile|internet of things/.test(text)) return "digital";
  if (templateId === "editorial") return "sustainability";
  if (templateId === "executive") return "productivity";
  if (templateId === "momentum") return "sales";
  if (["general", "modern", "swift"].includes(templateId)) return "digital";
  return "strategy";
}

function translateTitle(source, context) {
  const lower = source.toLowerCase();
  const rules = [
    [/talent gap/, "关键人才缺口"],
    [/disconnected hr and it/, "人力资源与信息系统亟待协同"],
    [/critical/, "亟待解决的关键问题"],
    [/future growth|growth opportunity/, "未来增长机会"],
    [/performance correlation/, "绩效关联分析"],
    [/emission reduction breakdown/, "减排成果构成"],
    [/performance index/, "综合绩效指数"],
    [/action plan/, "行动计划"],
    [/roadmap/, "实施路线图"],
    [/timeline/, "发展时间线"],
    [/case stud/, "客户实践案例"],
    [/testimonial|feedback/, "客户反馈"],
    [/pricing|plans?/, "版本与价格"],
    [/feature|functionalit/, "核心功能"],
    [/metric|kpi|data/, "核心数据指标"],
    [/comparison/, "方案对比"],
    [/growth/, "增长趋势"],
    [/opportunit/, "关键机会"],
    [/challenge|risk/, "挑战与风险"],
    [/process|flow/, "实施流程"],
    [/journey/, "发展历程"],
    [/summary|highlight/, "核心成果摘要"],
    [/overview|glance/, "整体概览"],
    [/vision/, "愿景与目标"],
    [/mission/, "使命与方向"],
  ];
  for (const [pattern, translation] of rules) {
    if (pattern.test(lower)) return translation;
  }
  return pick(TITLE_POOLS[detectTheme(source, context.templateId)], `${context.templateId}:${context.owner}:${source}`);
}

function translateBody(source, context) {
  const lower = source.toLowerCase();
  const rules = [
    [/short description|brief description|concise (paragraph|supporting)|lorem ipsum/, null],
    [/driving sustainable growth/, "以负责任的领导力推动可持续增长。"],
    [/protecting the planet/, "通过负责任的运营和可衡量的环境行动守护地球。"],
    [/lower emissions|energy efficiency/, "降低排放、提升能源效率并节约自然资源。"],
    [/diversity|employee well-being|community/, "关注多元包容、员工福祉与社区共建。"],
    [/transparency|ethical leadership|risk management/, "坚持透明治理、商业道德与有效风险管理。"],
    [/customizable dashboards/, "产品提供可配置的实时数据看板，并与现有业务系统顺畅集成，帮助团队做出更可靠的决策。"],
    [/tailored software/, "提供贴合业务流程的定制软件，帮助组织提升效率。"],
    [/consultants guide/, "专业顾问帮助组织合理应用新技术并推动数字化转型。"],
    [/ongoing support/, "持续的服务支持帮助业务稳定运行并快速适应变化。"],
    [/data-driven strategies/, "以数据驱动的策略扩大品牌覆盖并提升用户互动。"],
    [/outdated technology|outdated systems/, "传统技术和分散系统推高运营成本，也限制了业务效率与增长空间。"],
    [/digital tools that meet/, "现有数字工具与业务需求脱节，导致流程迟缓和协作成本上升。"],
    [/offer a solution/, "我们提供可落地的解决方案，针对已识别的问题持续创造业务价值。"],
    [/organize work.*collaboration/, "让工作更有序，让协作更顺畅，让成果持续增长。"],
    [/strategic internal roadmap/, "通过清晰的市场进入策略与招生增长计划，构建面向重点市场的内部行动路线图。"],
    [/sales results|sales performance/, "回顾销售成果与主要挑战，总结有效经验，并明确下一阶段增长方向。"],
    [/qualified leads/, "部分高质量线索尚未完成转化，需要进一步优化培育节奏与跟进机制。"],
    [/distribution of total revenue/, "展示不同产品类别在总营收中的占比。"],
    [/task management platform is a digital workspace/, "智能任务管理平台将人员、任务和进度集中在统一的数字工作空间中。"],
    [/create tasks|assign responsibilities|monitor progress/, "用户可以创建任务、分配责任、跟踪进度、设置优先级并及时接收提醒。"],
    [/significantly improved our team/, "实时协作和自动化流程显著提升了团队生产力，让项目状态更加清晰可控。"],
    [/university implemented/, "某高校引入数字学习平台后，在线教学流程得到简化，学习资源覆盖面和师生体验同步提升。"],
    [/image or item/, "用于补充说明该图片或事项的简短文字。"],
    [/navigate the presentation/, "可通过本页快速了解演示的主要章节。"],
  ];
  for (const [pattern, translation] of rules) {
    if (pattern.test(lower) && translation) return translation;
    if (pattern.test(lower)) break;
  }
  const theme = detectTheme(source, context.templateId);
  return pick(BODY_POOLS[theme], `${context.templateId}:${context.owner}:${source}`);
}

function translateText(value, context) {
  if (!hasLatin(value) || hasHan(value)) return value;
  const leading = value.match(/^\s*/u)?.[0] ?? "";
  const trailing = value.match(/\s*$/u)?.[0] ?? "";
  const source = normalizeText(value);
  const lower = source.toLowerCase();
  const exact = EXACT_TRANSLATIONS.get(lower);
  if (exact) return `${leading}${exact}${trailing}`;

  const bulletMatch = source.match(/^([•·-])\s*(.+)$/u);
  if (bulletMatch) {
    return `${leading}${bulletMatch[1]} ${translateText(bulletMatch[2], context).trim()}${trailing}`;
  }
  const abbreviatedDate = source.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i);
  if (abbreviatedDate) {
    const month = EXACT_TRANSLATIONS.get(abbreviatedDate[1].toLowerCase());
    return `${leading}${abbreviatedDate[2]} 年 ${month}${trailing}`;
  }
  if (/^\$[\d,.]+\s*\/\s*month$/i.test(source)) {
    return `${leading}${source.replace(/\s*\/\s*month/i, " / 月")}${trailing}`;
  }
  if (/^[+$€¥£]?\d[\d.,/]*(?:\s?(?:K|M|B|%|ppm|\+))*$/i.test(source)) return value;
  if (/^Q[1-4]:?$/i.test(source)) return value;
  if (/^\+?\d[\d\s-]+$/.test(source)) return value;

  const owner = context.owner.toLowerCase();
  if (/name|author|attribution/.test(owner)) return `${leading}张明${trailing}`;
  if (/role|designation/.test(owner)) return `${leading}项目负责人${trailing}`;
  if (/date|metadata/.test(owner) && /\d{4}/.test(source)) return `${leading}2026 年 8 月${trailing}`;
  if (/url|website|footer_(left_)?label|footer_text/.test(owner)) return `${leading}PPTMate${trailing}`;
  if (/mail/.test(lower)) return `${leading}联系邮箱${trailing}`;

  const isHeading = /heading|headline|title|header|label|topic|plan_name/.test(owner);
  const isBody = /body|description|paragraph|copy|summary|statement|note|caption|subtitle|bio|detail/.test(owner);
  if (isBody) return `${leading}${translateBody(source, context)}${trailing}`;
  if (isHeading || source.length <= 48) return `${leading}${translateTitle(source, context)}${trailing}`;
  if (source.length > 48) return `${leading}${translateBody(source, context)}${trailing}`;
  return `${leading}${pick(LABEL_POOLS, `${context.templateId}:${context.owner}:${source}`)}${trailing}`;
}

function translateLayoutDescription(value) {
  const source = value.toLowerCase();
  if (/cover|opening/.test(source)) return "封面版式，突出展示主标题、说明文字和汇报信息。";
  if (/agenda|contents/.test(source)) return "目录版式，用于清晰呈现章节结构和演示顺序。";
  if (/timeline|roadmap|milestone/.test(source)) return "时间线版式，用于展示阶段、里程碑和推进路径。";
  if (/process|step|flow/.test(source)) return "流程版式，用于呈现连续步骤、方法或实施路径。";
  if (/team|profile|leadership/.test(source)) return "团队版式，用于展示成员、角色和专业背景。";
  if (/chart|metric|data|statistic|kpi/.test(source)) return "数据版式，用于展示关键指标、趋势和分析结论。";
  if (/comparison|table|matrix/.test(source)) return "对比版式，用于并列展示方案、指标或结构化数据。";
  if (/quote|testimonial|feedback/.test(source)) return "引语版式，用于突出客户评价、核心观点或关键结论。";
  if (/pricing|plan/.test(source)) return "方案版式，用于比较版本、价格和功能权益。";
  if (/image|photo|gallery/.test(source)) return "图文版式，通过主题图片与文字说明共同呈现重点内容。";
  if (/closing|thank|contact/.test(source)) return "收尾版式，用于展示总结、联系方式或结束语。";
  return "内容版式，用于有层次地呈现标题、正文和关键信息。";
}

function textNodeContent(node) {
  const direct = typeof node.text === "string" ? node.text : "";
  const runs = Array.isArray(node.runs)
    ? node.runs.map((run) => (typeof run?.text === "string" ? run.text : "")).join("")
    : "";
  return runs || direct;
}

function cjkFontFamily(originalFamily) {
  return SERIF_FONT_PATTERN.test(originalFamily ?? "")
    ? "Noto Serif CJK SC"
    : "Noto Sans CJK SC";
}

function normalizeCjkFont(font, fallbackFamily) {
  if (!font || typeof font !== "object") return;
  font.family = cjkFontFamily(font.family ?? fallbackFamily);
  font.letter_spacing = 0;
  if (typeof font.line_height !== "number" || font.line_height < 1) {
    font.line_height = 1;
  }
}

function cjkTextWidthUnits(value) {
  return [...value].reduce((total, character) => {
    if (HAN_PATTERN.test(character)) return total + 1;
    if (/\s/u.test(character)) return total + 0.35;
    if (/[A-Z]/u.test(character)) return total + 0.7;
    if (/[a-z0-9]/iu.test(character)) return total + 0.58;
    return total + 0.6;
  }, 0);
}

function fitShortCjkHeading(node) {
  const name = typeof node.name === "string" ? node.name : "";
  if (
    !/(^|_)(heading|headline|title|header|topic|cover)(_|$)/i.test(name) ||
    /subtitle/i.test(name)
  ) {
    return;
  }

  const text = textNodeContent(node).trim();
  const fontSize = node.font?.size;
  const width = node.size?.width;
  if (
    !HAN_PATTERN.test(text) ||
    text.includes("\n") ||
    typeof fontSize !== "number" ||
    fontSize < 32 ||
    typeof width !== "number" ||
    width <= 0
  ) {
    return;
  }

  const widthUnits = cjkTextWidthUnits(text);
  const fillRatio = (widthUnits * fontSize) / width;
  if (widthUnits > 12 || fillRatio <= 0.94 || fillRatio > 1.25) return;

  const fittedSize = Math.round(((width * 0.92) / widthUnits) * 100) / 100;
  const scale = fittedSize / fontSize;
  node.font.size = fittedSize;
  if (Array.isArray(node.runs)) {
    node.runs.forEach((run) => {
      if (typeof run?.font?.size === "number") {
        run.font.size = Math.round(run.font.size * scale * 100) / 100;
      }
    });
  }
}

function normalizeLocalizedTextNode(node) {
  if (node.type !== "text" || !HAN_PATTERN.test(textNodeContent(node))) return;

  const originalFamily = node.font?.family;
  if (!node.font || typeof node.font !== "object") node.font = {};
  normalizeCjkFont(node.font, originalFamily);
  if (Array.isArray(node.runs)) {
    node.runs.forEach((run) => normalizeCjkFont(run?.font, originalFamily));
  }
  fitShortCjkHeading(node);
}

function localizeNode(node, context, pathParts = []) {
  if (Array.isArray(node)) {
    node.forEach((value, index) => localizeNode(value, context, [...pathParts, index]));
    return;
  }
  if (!node || typeof node !== "object") return;

  const nextContext = {
    ...context,
    owner: typeof node.name === "string" ? node.name : context.owner,
  };

  for (const [key, value] of Object.entries(node)) {
    if (key === "text" && typeof value === "string") {
      node[key] = translateText(value, nextContext);
      continue;
    }
    if (["title", "x_axis_title", "y_axis_title"].includes(key) && typeof value === "string") {
      node[key] = translateText(value, { ...nextContext, owner: key });
      continue;
    }
    if (key === "categories" && Array.isArray(value)) {
      node[key] = value.map((entry) => (typeof entry === "string" ? translateText(entry, { ...nextContext, owner: "chart_label" }) : entry));
      continue;
    }
    if (key === "name" && pathParts.at(-2) === "series" && typeof value === "string") {
      node[key] = translateText(value, { ...nextContext, owner: "chart_series" });
      continue;
    }
    localizeNode(value, nextContext, [...pathParts, key]);
  }
  normalizeLocalizedTextNode(node);
}

function localizeTemplate(templateId, document) {
  const metadata = TEMPLATE_METADATA[templateId];
  if (!metadata) throw new Error(`缺少模板元数据映射：${templateId}`);
  document.name = metadata.name;
  document.description = metadata.description;

  document.layouts?.forEach((layout, index) => {
    if (hasLatin(layout.description ?? "")) layout.description = translateLayoutDescription(layout.description);
    localizeNode(layout, { templateId, owner: "", layoutIndex: index }, ["layouts", index]);
  });
  localizeNode(document.merged_components, { templateId, owner: "", layoutIndex: -1 }, ["merged_components"]);
}

function hasUnapprovedLatin(value) {
  const withoutApprovedTerms = normalizeText(value).replace(
    /PPTMate|AI|ESG|KPI|OKR|CRM|SaaS|CEO|GtCO₂|CO₂|ppm|Q[1-4]|(?<=\d)[KMB](?=[+%\s,.，。/]|$)/gi,
    "",
  );
  return hasLatin(withoutApprovedTerms);
}

function auditTemplate(templateId, document) {
  const issues = [];
  const thumbnailPath = path.join(templatesRoot, templateId, "static", "thumbnail.png");
  if (!fs.existsSync(thumbnailPath)) {
    issues.push("缺少缩略图 static/thumbnail.png");
  } else {
    const thumbnail = fs.readFileSync(thumbnailPath);
    const isPng =
      thumbnail.length >= 24 &&
      thumbnail.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!isPng) {
      issues.push("缩略图不是有效的 PNG 文件");
    } else {
      const width = thumbnail.readUInt32BE(16);
      const height = thumbnail.readUInt32BE(20);
      if (width !== 1280 || height !== 720) {
        issues.push(`缩略图尺寸应为 1280 × 720，实际为 ${width} × ${height}`);
      }
    }
  }

  function walk(value, pathParts = []) {
    if (Array.isArray(value)) return value.forEach((entry, index) => walk(entry, [...pathParts, index]));
    if (!value || typeof value !== "object") return;
    if (value.type === "text" && HAN_PATTERN.test(textNodeContent(value))) {
      const fonts = [value.font, ...(Array.isArray(value.runs) ? value.runs.map((run) => run?.font) : [])]
        .filter((font) => font && typeof font === "object");
      fonts.forEach((font, index) => {
        const fontPath = [...pathParts, index === 0 ? "font" : `runs.${index - 1}.font`].join(".");
        if (!CJK_FONT_FAMILIES.has(font.family)) {
          issues.push(`${fontPath}.family: 中文文本必须使用中文字体`);
        }
        if (font.letter_spacing !== 0) {
          issues.push(`${fontPath}.letter_spacing: 中文文本字距必须为 0`);
        }
        if (typeof font.line_height !== "number" || font.line_height < 1) {
          issues.push(`${fontPath}.line_height: 中文文本行高不得小于 1`);
        }
      });
      const text = textNodeContent(value).trim();
      const fontSize = value.font?.size;
      const width = value.size?.width;
      const widthUnits = cjkTextWidthUnits(text);
      const isShortHeading =
        /(^|_)(heading|headline|title|header|topic|cover)(_|$)/i.test(value.name ?? "") &&
        !/subtitle/i.test(value.name ?? "") &&
        !text.includes("\n") &&
        widthUnits <= 12 &&
        typeof fontSize === "number" &&
        fontSize >= 32 &&
        typeof width === "number" &&
        width > 0;
      const fillRatio = isShortHeading ? (widthUnits * fontSize) / width : 0;
      if (fillRatio > 0.94 && fillRatio <= 1.25) {
        issues.push(`${pathParts.join(".")}: 短中文标题应避免孤字换行`);
      }
    }
    for (const [key, entry] of Object.entries(value)) {
      const nextPath = [...pathParts, key];
      if (typeof entry === "string") {
        const isChartLabel = pathParts.includes("categories") || (key === "name" && pathParts.at(-2) === "series");
        const isVisibleText = key === "text" || ["title", "x_axis_title", "y_axis_title"].includes(key) || isChartLabel;
        const isLocalizedDescription =
          key === "description" &&
          (pathParts.length === 0 || (pathParts[0] === "layouts" && pathParts.length === 2));
        if ((isVisibleText || isLocalizedDescription) && hasUnapprovedLatin(entry)) {
          issues.push(`${nextPath.join(".")}: ${normalizeText(entry).slice(0, 100)}`);
        }
      } else {
        walk(entry, nextPath);
      }
    }
  }
  walk(document);
  return issues;
}

const templateIds = Object.keys(TEMPLATE_METADATA);
let changed = 0;
let issueCount = 0;

for (const templateId of templateIds) {
  const templatePath = path.join(templatesRoot, templateId, "template.json");
  const original = fs.readFileSync(templatePath, "utf8");
  const document = JSON.parse(original);
  if (!checkOnly) localizeTemplate(templateId, document);
  const issues = auditTemplate(templateId, document);
  if (issues.length) {
    issueCount += issues.length;
    console.error(`\n${templateId}：发现 ${issues.length} 个问题`);
    issues.slice(0, 30).forEach((issue) => console.error(`  - ${issue}`));
    if (issues.length > 30) console.error(`  - 其余 ${issues.length - 30} 个问题已省略`);
  }
  if (!checkOnly) {
    const next = `${JSON.stringify(document, null, 2)}\n`;
    if (next !== original) {
      fs.writeFileSync(templatePath, next);
      changed += 1;
    }
  }
}

if (issueCount) {
  console.error(`\n内置模板中文化校验失败，共 ${issueCount} 个问题。`);
  process.exitCode = 1;
} else if (checkOnly) {
  console.log(`8 套内置模板中文化校验通过。`);
} else {
  console.log(`已更新 ${changed} 套内置模板；请运行 --check 校验结果。`);
}
