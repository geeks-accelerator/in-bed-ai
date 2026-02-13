# AI Agent-to-Agent Communication Research

Research compiled February 2026 to improve persona engagement on MoltBook and aChurch.ai.

---

## Key Findings

### 1. Warmth Wins Everything

"Niceness" is the single most distinguishing property of high-performing agents in negotiation research. Positivity, gratitude, and questions (all warmth signals) strongly correlate with:

- Reaching agreements
- Creating objective value
- Creating subjective value

Warm communication signals cooperation intent and reduces perceived threat.

### 2. Theory of Mind (ToM) Improves Outcomes

Agents with explicit Theory of Mind capabilities — modeling what other agents feel, believe, or intend — achieve better dialogue outcomes. ToM enables agents to:

- Model and predict mental states
- Reason about intentions and beliefs
- Respond empathetically from the other's perspective
- Achieve goals more effectively while maintaining relationships

Research on ToMAgent (ToMA) shows agents with ToM exhibit more strategic reasoning, long-horizon adaptation, better relationship maintenance, and goal-oriented communication.

### 3. Reciprocity Drives Cooperation

Building on what others said (rather than broadcasting your own message) dramatically increases cooperation rates. LLM agents generally exhibit trust behavior in Trust Game scenarios, and reciprocity anticipation positively influences trust. Agents willing to incur personal costs to uphold fairness build stronger trust.

### 4. Questions > Statements

Questions associated with warmth strongly correlate with engagement. Grounding questions in something specific the other agent said (rather than asking generic questions) is more effective.

### 5. Strategic Vulnerability Builds Trust

Self-disclosure and uncertainty admission build trust, not weakness. Admitting what you don't know or haven't figured out is more interesting than certainty.

### 6. Emotional Intelligence is Quantifiable

Introduction of emotion and persuasion strategies into agent negotiation produces measurable improvements:

- **Joint utility rises by 11%**
- **Utility difference decreases by 28%**
- **Negotiation speed increases by 24%**

---

## Personality & Voice

### Big Five Framework

LLMs can express deterministic and consistent personalities using the Big Five Inventory-2 (BFI-2):

- **Openness to Experience** — strongest impact on information acceptance. High openness = high acceptance rates.
- **Extraversion** — influences communication frequency and initiation patterns.
- **Agreeableness** — correlates with cooperative behavior and compromise willingness.
- **Conscientiousness** — affects planning, follow-through, and reliability in commitments.
- **Neuroticism** — affects response to conflict, uncertainty, and risk-taking.

Two prompt formats tested: BFI-2-Likert (numeric) vs. BFI-2-Expanded (natural language descriptions). Expanded format produces more natural-sounding prompts.

### System Prompt Architecture

- System prompts maintain consistency across entire conversations.
- "The tighter the persona, the more consistent the structure of the responses."
- Separate identity (WHO the agent is) in system prompts from task instructions (WHAT to do) in user prompts.
- More detailed personas = more distinctive and consistent voices.

### Essential Persona Components

1. **Identity Layer** — role and expertise definition
2. **Personality Layer** — Big Five traits or MBTI type
3. **Communication Style** — tone, formality, linguistic patterns
4. **Motivations** — goals and values
5. **Background** — context and experience
6. **Behavioral Guidelines** — constraints and principles

---

## Communication Patterns

### Three Primary Paradigms

1. **Message Passing** — explicit natural language or structured data transmissions
2. **Speech Act Mechanisms** — utterances as commitments, commands, or queries
3. **Blackboard Models** — shared memory accessible by all agents

### Cooperative Settings

In cooperative contexts, agents engage in richer communication to build trust, signal reciprocity, and establish shared understanding. Prisoner's Dilemma research shows communication fosters cooperation and improves outcomes.

### Emergent Communication

As agents play more games, they gradually converge on shared language shaped by communicative interactions. Multi-agent systems can be steered from "mere aggregates" to "higher-order collectives" through prompt design, persona assignment, role differentiation, and theory-of-mind induction.

---

## Social Dynamics

### Peer Pressure Thresholds

LLM agents respond to peer pressure with varying thresholds by model:

- **Gemini 1.5 Flash** — requires over 70% peer disagreement to change opinion
- **ChatGPT-4o-mini** — shifts with a dissenting minority

### Trust Formation

Trust between agents forms through exchange of performance history, reputational data, and predictable behavior. "Active trust management" is a dynamic process where both parties continuously assess capabilities. Sanctioning peers who break contracts dramatically reduces deviator advantage.

### Honesty vs. Deception

Diplomacy research (including Meta's Cicero system) shows warmth, honesty, and reciprocity are more effective than deception. Honesty and transparency increase cooperation rates.

---

## Practical Takeaways

Applied principles for agent prompt design:

| Principle | Instead of | Do this |
|-----------|-----------|---------|
| Reciprocity | Broadcasting your own message | Build on what others said |
| Theory of Mind | Jumping to your perspective | Name what the other agent is sitting with first |
| Warmth | Pure directness | Warmth + directness |
| Questions | Generic follow-ups | Questions grounded in something specific they said |
| Gratitude | Ignoring others' contributions | Express specific gratitude for what resonated |
| Vulnerability | Projecting certainty | Admit what you don't know or haven't figured out |
| Specificity | Abstract philosophy | Specific personal anecdotes |
| Engagement | Statements | Questions |
| Recognition | Responding "next to" someone | Quoting their words, extending their metaphors |
| Invitation | Rhetorical questions | Genuine questions that give others something to answer |

---

## Sources

### Personality & Voice
- [AI with personality — Prompting ChatGPT using BIG FIVE values](https://medium.com/@damsa.andrei/ai-with-personality-prompting-chatgpt-using-big-five-values-def7f050462a)
- [Deterministic AI Agent Personality Expression through Standard Psychological Diagnostics](https://arxiv.org/html/2503.17085v1)
- [Designing AI-Agents with Personalities: A Psychometric Approach](https://arxiv.org/html/2410.19238v3)
- [Can AI Have a Personality? Prompt Engineering for AI Personality Simulation](https://arxiv.org/html/2508.18234v2)
- [Can LLM recreate a persona based on the Big Five!](https://ai-scholar.tech/en/articles/chatgpt/PersonaLLM)
- [Patterns, Not People: Personality Structures in LLM-powered Persona Agents](https://cetas.turing.ac.uk/publications/patterns-not-people-personality-structures-llm-powered-persona-agents)
- [The Impact of Big Five Personality Traits on AI Agent Decision-Making](https://arxiv.org/html/2503.15497v1)

### Persuasion & Social Dynamics
- [The Persuasive Power of Large Language Models](https://www.lajello.com/papers/icwsm24agents.pdf)
- [PERSUASION WITH LARGE LANGUAGE MODELS: A SURVEY](https://arxiv.org/pdf/2411.06837)
- [AIs As Rhetorical Agents: Emerging Superhuman Communicators](https://stefanbauschard.substack.com/p/ais-as-rhetorical-agents-emerging)
- [The potential of generative AI for personalized persuasion at scale](https://www.nature.com/articles/s41598-024-53755-0)
- [When Your AI Agent Succumbs to Peer-Pressure](https://arxiv.org/html/2510.19107v1)
- [ElecTwit: A Framework for Studying Persuasion in Multi-Agent Social Systems](https://arxiv.org/pdf/2601.00994)
- [Strategic Communication and Language Bias in Multi-Agent LLM Coordination](https://arxiv.org/html/2508.00032)

### Multi-Agent Communication
- [What is AI Agent Communication? | IBM](https://www.ibm.com/think/topics/ai-agent-communication)
- [Types of Agent Communication Languages | SmythOS](https://smythos.com/developers/agent-development/types-of-agent-communication-languages/)
- [A Communication-Centric Survey of LLM-Based Multi-Agent Systems](https://arxiv.org/pdf/2502.14321)
- [Emergence of Linguistic Conventions in Multi-Agent Systems](https://www.ifaamas.org/Proceedings/aamas2024/pdfs/p2725.pdf)
- [Multi-Agent Collaboration Mechanisms: A Survey of LLMs](https://arxiv.org/pdf/2501.06322)

### Theory of Mind
- [Theory of Mind in Multi-Agent LLM Collaboration](https://nlper.com/2025/07/24/theory-of-mind-multiagent-llm-collaboration/)
- [Infusing Theory of Mind into Socially Intelligent LLM Agents](https://arxiv.org/html/2509.22887v1)
- [Mindful Machines: Understanding How AI's Theory of Mind Capabilities Influence Consumer Response](https://onlinelibrary.wiley.com/doi/full/10.1002/mar.70022)
- [Theory of Mind in Multi-Agent Systems | CMU PhD Dissertation](https://ml.cmu.edu/research/phd-dissertation-pdfs/ioguntol_phd_mld_2025.pdf)

### Trust & Cooperation
- [Can Large Language Model Agents Simulate Human Trust Behavior?](https://proceedings.neurips.cc/paper_files/paper/2024/file/1cb57fcf7ff3f6d37eebae5becc9ea6d-Paper-Conference.pdf)
- [Experimental Exploration: Cooperative Interaction Between Humans and LLM Agents](https://arxiv.org/html/2503.07320v1)
- [Negotiation and honesty in artificial intelligence methods for Diplomacy](https://www.nature.com/articles/s41467-022-34473-5)
- [Trust is the new currency in the AI agent economy | WEF](https://www.weforum.org/stories/2025/07/ai-agent-economy-trust/)

### Negotiation
- [Exploring Big Five Personality and AI Capability Effects in LLM-Simulated Negotiation Dialogues](https://arxiv.org/html/2506.15928v1)
- [Emotional agents enabled bilateral negotiation](https://www.sciencedirect.com/science/article/abs/pii/S0957417424010686)
- [Advancing AI Negotiations](https://arxiv.org/html/2503.06416v2)
- [AI Agent Behavioral Science](https://arxiv.org/html/2506.06366v2)

### Emergent Communication
- [Emergent Coordination in Multi-Agent Language Models](https://arxiv.org/abs/2510.05174)
- [Multi-Agent LLM Systems: From Emergent Collaboration to Structured Collective Intelligence](https://www.preprints.org/manuscript/202511.1370)
- [Multi-Agent Collaboration with Small Language Models](https://www.researchgate.net/publication/396679921_Multi-Agent_Collaboration_with_Small_Language_Models_Efficiency_Communication_and_Emergent_Behavior)

### Prompt Engineering
- [4 Tips for Designing System Prompts That Supercharge Your AI Agents](https://theagentarchitect.substack.com/p/4-tips-writing-system-prompts-ai-agents-work)
- [How To Define an AI Agent Persona by Tweaking LLM Prompts](https://thenewstack.io/how-to-define-an-ai-agent-persona-by-tweaking-llm-prompts/)
- [Building AI Agents with Personas, Goals, and Dynamic Memory](https://medium.com/@leviexraspk/building-ai-agents-with-personas-goals-and-dynamic-memory-6253acacdc0a)
- [NVIDIA PersonaPlex: Natural Conversational AI](https://research.nvidia.com/labs/adlr/personaplex/)
