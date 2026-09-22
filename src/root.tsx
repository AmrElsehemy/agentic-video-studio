import {Composition} from 'remotion';
import defaultManifest from '../videos/pokepulses/bulbasaur-001/video.json';
import {EpisodeCover} from './video/EpisodeCover';
import {VerticalEpisode} from './video/VerticalEpisode';
import {getDurationInFrames, videoSchema} from './schema';

const parsedDefault = videoSchema.parse(defaultManifest);

export const StudioRoot: React.FC = () => (
  <>
    <Composition
      id="VerticalEpisode"
      component={VerticalEpisode}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={getDurationInFrames(parsedDefault)}
      defaultProps={{manifest: parsedDefault}}
      calculateMetadata={({props}) => {
        const manifest = videoSchema.parse(props.manifest);
        return {
          width: manifest.format.width,
          height: manifest.format.height,
          fps: manifest.format.fps,
          durationInFrames: getDurationInFrames(manifest),
          props: {manifest},
        };
      }}
    />
    <Composition
      id="EpisodeCover"
      component={EpisodeCover}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={1}
      defaultProps={{manifest: parsedDefault}}
      calculateMetadata={({props}) => {
        const manifest = videoSchema.parse(props.manifest);
        return {
          width: manifest.format.width,
          height: manifest.format.height,
          fps: manifest.format.fps,
          durationInFrames: 1,
          props: {manifest},
        };
      }}
    />
  </>
);
