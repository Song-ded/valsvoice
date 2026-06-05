class AudioProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input[0]) {
            const audioData = input[0]; // Float32Array
            // Конвертируем в Int16
            const int16Data = new Int16Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
                const s = Math.max(-1, Math.min(1, audioData[i]));
                int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            
            // Отправляем данные в основной поток
            this.port.postMessage({
                audio: int16Data.buffer
            }, [int16Data.buffer]);
        }
        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);
