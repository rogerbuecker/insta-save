import type { Person } from '../types';
import BottomSheet from './BottomSheet';
import './WhoAreYouDialog.css';

interface WhoAreYouDialogProps {
  reason?: string;
  onChoose: (person: Person) => void;
  onClose: () => void;
}

/** "Wer bist du?" — decides who gets recipes via Telegram. */
const WhoAreYouDialog = ({ reason, onChoose, onClose }: WhoAreYouDialogProps) => (
  <BottomSheet title="Wer bist du?" onClose={onClose}>
    <p className="who-text">
      {reason ?? 'Damit Rezepte aus Beiträgen per Telegram bei der richtigen Person ankommen.'}
      {' '}Das kannst du später unter „Mehr“ ändern.
    </p>
    <div className="who-options">
      <button className="who-option" onClick={() => onChoose('nadine')}>
        <span className="who-avatar">N</span>Nadine
      </button>
      <button className="who-option" onClick={() => onChoose('roger')}>
        <span className="who-avatar">R</span>Roger
      </button>
    </div>
  </BottomSheet>
);

export default WhoAreYouDialog;
