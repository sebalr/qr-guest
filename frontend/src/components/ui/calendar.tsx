'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			className={cn('w-fit p-3', className)}
			classNames={{
				months: 'relative flex flex-col gap-4 sm:flex-row',
				month: 'flex w-full flex-col gap-4',
				nav: 'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
				button_previous: cn(buttonVariants({ variant: 'outline' }), 'h-8 w-8 p-0 opacity-60 hover:opacity-100'),
				button_next: cn(buttonVariants({ variant: 'outline' }), 'h-8 w-8 p-0 opacity-60 hover:opacity-100'),
				month_caption: 'flex h-8 w-full items-center justify-center px-10',
				caption_label: 'select-none text-sm font-medium',
				table: 'w-full border-collapse',
				weekdays: 'flex',
				weekday: 'flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground',
				week: 'mt-2 flex w-full',
				day: cn(
					'group/day relative aspect-square h-8 w-8 p-0 text-center text-sm [&:has([aria-selected])]:bg-accent [&:has([aria-selected].rdp-outside)]:bg-accent/50',
					props.mode === 'range'
						? '[&:has(>.rdp-range_end)]:rounded-r-md [&:has(>.rdp-range_start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md'
						: '[&:has([aria-selected])]:rounded-md',
				),
				day_button: cn(buttonVariants({ variant: 'ghost' }), 'h-8 w-8 p-0 font-normal aria-selected:opacity-100'),
				range_start: 'rdp-range_start',
				range_end: 'rdp-range_end',
				selected:
					'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
				today: 'bg-accent text-accent-foreground',
				outside: 'rdp-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground',
				disabled: 'text-muted-foreground opacity-50',
				range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
				hidden: 'invisible',
				...classNames,
			}}
			{...props}
		/>
	);
}
Calendar.displayName = 'Calendar';

export { Calendar };
