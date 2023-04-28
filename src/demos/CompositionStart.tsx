import { useState } from 'react';

const Composition = () => {
  const [inputValue, setInputValue] = useState('');

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('Input', event.target.value);
    setInputValue(event.target.value);
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('Change', event.type);
  }

  const handleCompositionStart = (event: React.CompositionEvent<HTMLInputElement>) => {
    console.log('Composition Start', event.type);
  }

  const handleCompositionEnd = (event: React.CompositionEvent<HTMLInputElement>) => {
    console.log('Composition End', event.type);
  }

  return (
    <input
      value={inputValue}
      onInput={handleInput}
      onChange={handleInputChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    />
  )
}

export default Composition;