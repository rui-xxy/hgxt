import { CheckIcon } from '../../../components/icons';

interface ThermalStopButtonProps {
  stopped: boolean;
  onChange: (stopped: boolean) => void;
  label: string;
  compact?: boolean;
  disabled?: boolean;
}

/** 默认空值；单击标记停车，再次单击清除标记。 */
export function ThermalStopButton({ stopped, onChange, label, compact = false, disabled = false }: ThermalStopButtonProps) {
  return <button
    type="button"
    className={`forms-stop-button${stopped ? ' is-stopped' : ''}${compact ? ' forms-stop-button-compact' : ''}`}
    aria-label={`${label}：${stopped ? '已停车，点击取消' : '点击标记停车'}`}
    aria-pressed={stopped}
    disabled={disabled}
    onClick={() => onChange(!stopped)}
  >
    {stopped && <CheckIcon width={14} height={14} />}
    <span>{stopped ? '已停车' : '停车'}</span>
  </button>;
}
