import { Navigation } from '@/components/Navigation';
import {
  HeroSection,
  HowItWorksSection,
  MatchModesSection,
  CollaborationSection,
  CreditSystemSection,
  ReputationSection,
  SafetySection,
  TestimonialsSection,
  FinalCTASection,
} from '@/sections';

export function LandingPage() {
  return (
    <main className="min-h-screen bg-pairon-bg dark:bg-gray-900">
      <Navigation />
      <HeroSection />
      <HowItWorksSection />
      <MatchModesSection />
      <CollaborationSection />
      <CreditSystemSection />
      <ReputationSection />
      <SafetySection />
      <TestimonialsSection />
      <FinalCTASection />
    </main>
  );
}
