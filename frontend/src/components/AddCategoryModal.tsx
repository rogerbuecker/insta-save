import React, { useState, useEffect } from 'react';
import './AddCategoryModal.css';

interface AddCategoryModalProps {
  existingCategories: string[];
  onAdd: (category: string) => void;
  onCancel: () => void;
}

const AddCategoryModal: React.FC<AddCategoryModalProps> = ({ existingCategories, onAdd, onCancel }) => {
  const [categoryName, setCategoryName] = useState('');
  const [error, setError] = useState('');

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onCancel]);

  const handleSubmit = () => {
    const trimmedName = categoryName.trim();

    if (!trimmedName) {
      setError('Category name cannot be empty');
      return;
    }

    if (trimmedName.length < 2) {
      setError('Category name must be at least 2 characters');
      return;
    }

    if (trimmedName.length > 30) {
      setError('Category name must be less than 30 characters');
      return;
    }

    // Check if category already exists (case-insensitive)
    if (existingCategories.some(cat => cat.toLowerCase() === trimmedName.toLowerCase())) {
      setError('This category already exists');
      return;
    }

    onAdd(trimmedName);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCategoryName(e.target.value);
    setError('');
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="add-category-overlay" onClick={onCancel}>
      <div className="add-category-modal" onClick={(e) => e.stopPropagation()}>
        <div className="add-category-icon">📁</div>
        <h2 className="add-category-title">Add New Category</h2>
        <p className="add-category-message">
          Create a custom category to organize your saved posts
        </p>

        <input
          type="text"
          value={categoryName}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder="Enter category name..."
          className="add-category-input"
          autoFocus
          maxLength={30}
        />

        {error && <div className="add-category-error">{error}</div>}

        <div className="add-category-actions">
          <button onClick={onCancel} className="add-category-cancel-btn">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="add-category-btn"
            disabled={!categoryName.trim()}
          >
            Add Category
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddCategoryModal;
