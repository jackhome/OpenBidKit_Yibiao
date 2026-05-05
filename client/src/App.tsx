import { useState } from 'react';
import AppShell from './components/AppShell';
import FloatingToolbar, {
  ToolbarArrowLeftIcon,
  ToolbarArrowRightIcon,
  ToolbarDocumentIcon,
  ToolbarOutlineIcon,
} from './components/FloatingToolbar';
import type { FloatingToolbarGroup } from './components/FloatingToolbar';
import BidDuplicateCheck from './pages/BidDuplicateCheck';
import KnowledgeBase from './pages/KnowledgeBase';
import RejectionCheck from './pages/RejectionCheck';
import TechnicalPlan from './pages/TechnicalPlan';

export type SectionId = 'technical-plan' | 'knowledge-base' | 'duplicate-check' | 'rejection-check';

const sectionOrder: SectionId[] = ['technical-plan', 'knowledge-base', 'duplicate-check', 'rejection-check'];

function App() {
  const [activeSection, setActiveSection] = useState<SectionId>('technical-plan');
  const activeIndex = sectionOrder.indexOf(activeSection);

  const goToSection = (offset: number) => {
    const nextSection = sectionOrder[activeIndex + offset];
    if (nextSection) {
      setActiveSection(nextSection);
    }
  };

  const toolbarGroups: FloatingToolbarGroup[] = [
    {
      id: 'page-navigation',
      actions: [
        {
          id: 'previous',
          label: '上一步',
          icon: <ToolbarArrowLeftIcon />,
          disabled: activeIndex <= 0,
          tooltip: activeIndex <= 0 ? '当前已经是第一个页面' : '切换到上一个页面',
          onClick: () => goToSection(-1),
        },
        {
          id: 'next',
          label: '下一步',
          icon: <ToolbarArrowRightIcon />,
          disabled: activeIndex >= sectionOrder.length - 1,
          tooltip: activeIndex >= sectionOrder.length - 1 ? '当前已经是最后一个页面' : '切换到下一个页面',
          onClick: () => goToSection(1),
        },
      ],
    },
    {
      id: 'technical-flow',
      actions: [
        {
          id: 'document-analysis',
          label: '标书解析',
          icon: <ToolbarDocumentIcon />,
          variant: activeSection === 'technical-plan' ? 'primary' : 'secondary',
          tooltip: '进入标书解析流程',
          onClick: () => setActiveSection('technical-plan'),
        },
        {
          id: 'outline-edit',
          label: '目录编辑',
          icon: <ToolbarOutlineIcon />,
          tooltip: '预留目录编辑入口，后续页面接入后可替换动作',
          onClick: () => setActiveSection('technical-plan'),
        },
      ],
    },
  ];

  const renderPage = () => {
    switch (activeSection) {
      case 'technical-plan':
        return <TechnicalPlan />;
      case 'knowledge-base':
        return <KnowledgeBase />;
      case 'duplicate-check':
        return <BidDuplicateCheck />;
      case 'rejection-check':
        return <RejectionCheck />;
      default:
        return null;
    }
  };

  return (
    <AppShell
      activeSection={activeSection}
      toolbar={<FloatingToolbar groups={toolbarGroups} />}
      onSectionChange={setActiveSection}
    >
      {renderPage()}
    </AppShell>
  );
}

export default App;
