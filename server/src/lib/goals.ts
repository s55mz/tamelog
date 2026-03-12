import { getGoalVisualContent } from "./goalIllustrations";

type GoalLike = {
  id: string;
  title: string;
  targetAmount: number;
  deadline: Date | null;
  visualCategory: string;
  visualSubcategory: string;
  visualTheme: string;
  visualLocked: boolean;
  goalRecords?: Array<{ amount: number }>;
};

export function getGoalCurrentAmount(goal: GoalLike) {
  return (goal.goalRecords ?? []).reduce((sum, item) => sum + item.amount, 0);
}

export function getGoalAchievementRate(targetAmount: number, currentAmount: number) {
  if (targetAmount <= 0) {
    return 0;
  }

  return Math.floor((currentAmount / targetAmount) * 100);
}

export function getGoalRemainingDays(deadline: Date | null) {
  if (!deadline) {
    return null;
  }

  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  return Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0);
}

export function getGoalVisualStep(achievementRate: number) {
  if (achievementRate >= 100) {
    return 5;
  }

  if (achievementRate >= 80) {
    return 5;
  }

  if (achievementRate >= 60) {
    return 4;
  }

  if (achievementRate >= 40) {
    return 3;
  }

  if (achievementRate >= 20) {
    return 2;
  }

  return 1;
}

export function serializeGoal(goal: GoalLike) {
  const currentAmount = getGoalCurrentAmount(goal);
  const achievementRate = getGoalAchievementRate(goal.targetAmount, currentAmount);
  const remainingAmount = Math.max(goal.targetAmount - currentAmount, 0);
  const remainingDays = getGoalRemainingDays(goal.deadline);
  const step = getGoalVisualStep(achievementRate);
  const visualContent = getGoalVisualContent(
    {
      visualCategory: goal.visualCategory,
      visualSubcategory: goal.visualSubcategory
    },
    step
  );

  return {
    id: goal.id,
    title: goal.title,
    targetAmount: goal.targetAmount,
    currentAmount,
    achievementRate,
    deadline: goal.deadline ? goal.deadline.toISOString().slice(0, 10) : null,
    remainingAmount,
    remainingDays,
    visual: {
      category: goal.visualCategory,
      subcategory: goal.visualSubcategory,
      theme: goal.visualTheme,
      step,
      imagePath: visualContent.imagePath,
      completeImagePath: visualContent.completeImagePath,
      altText: visualContent.altText,
      headlineText: visualContent.headlineText
    },
    visualCategory: goal.visualCategory,
    visualSubcategory: goal.visualSubcategory,
    visualTheme: goal.visualTheme,
    visualLocked: goal.visualLocked
  };
}

export function getFocusedGoalScore(goal: GoalLike) {
  const currentAmount = getGoalCurrentAmount(goal);
  const progressScore = goal.targetAmount > 0 ? currentAmount / goal.targetAmount : 0;
  const remainingDays = getGoalRemainingDays(goal.deadline);
  const deadlineScore = remainingDays === null ? 0.4 : Math.max(0, 1 - Math.min(remainingDays, 365) / 365);
  const priorityAdjustment = 0.5;

  return deadlineScore * 0.7 + progressScore * 1.0 + priorityAdjustment * 0.5;
}
