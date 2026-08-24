import React from 'react';
import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  title: string;
  description?: string;
  status: 'completed' | 'current' | 'upcoming';
}

interface StepsProps {
  steps: Step[];
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function Steps({ steps, orientation = 'horizontal', className }: StepsProps) {
  return (
    <div
      className={cn(
        'flex',
        orientation === 'horizontal' ? 'flex-row items-center justify-between' : 'flex-col',
        className
      )}
    >
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const nextStep = steps[index + 1];
        
        return (
          <React.Fragment key={step.id}>
            {/* Step indicator */}
            <div className="flex flex-col items-center relative">
              <div
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-300 bg-opacity-10',
                  {
                    'bg-green-100 border-green-500 text-green-600 dark:bg-green-900/20 dark:border-green-400 dark:text-green-400': step.status === 'completed',
                    'bg-blue-100 border-blue-500 text-blue-600 dark:bg-blue-900/20 dark:border-blue-400 dark:text-blue-400': step.status === 'current',
                    'bg-gray-100 border-gray-300 text-gray-400 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-500': step.status === 'upcoming',
                  }
                )}
              >
                {step.status === 'completed' ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Circle className="w-3 h-3 fill-current opacity-60" />
                )}
              </div>
              
              {/* Step content */}
              <div className="mt-3 text-center">
                <div
                  className={cn(
                    'text-xs font-medium transition-colors',
                    {
                      'text-green-600 dark:text-green-400': step.status === 'completed',
                      'text-blue-600 dark:text-blue-400': step.status === 'current',
                      'text-gray-500 dark:text-gray-400': step.status === 'upcoming',
                    }
                  )}
                >
                  {step.title}
                </div>
                {step.description && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {step.description}
                  </div>
                )}
              </div>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div className="flex-1 flex items-center px-4">
                <div
                  className={cn(
                    'w-full h-0.5 transition-colors duration-300',
                    {
                      'bg-green-500 dark:bg-green-400': step.status === 'completed',
                      'bg-blue-500 dark:bg-blue-400': step.status === 'current' && nextStep?.status !== 'upcoming',
                      'bg-gray-300 dark:bg-gray-600': step.status === 'upcoming' || nextStep?.status === 'upcoming',
                    }
                  )}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export type { Step, StepsProps };